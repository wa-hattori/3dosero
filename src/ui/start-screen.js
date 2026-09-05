import { SUPPORTED_BOARD_SIZES, BLACK, WHITE } from '../logic/board.js';
import { RANDOM_CPU_LEVEL, MAX_CPU_LEVEL } from '../logic/cpu.js';
import { playClickSound } from '../audio/click-sound.js';
import { isFirebaseConfigured } from '../net/firebase-config.js';
import {
  RoomNotFoundError,
  RoomNotJoinableError,
  createRoom,
  joinRoom,
  subscribeToRoom,
} from '../net/room-sync.js';
import { cancelRandomMatch, requestRandomMatch, subscribeToTicket } from '../net/matchmaking.js';
import { ROOM_CODE_LENGTH, isValidRoomCode } from '../net/room-code.js';
import { createPlayerProfile, getMyPlayerProfile } from '../net/player-profile.js';
import { MAX_NAME_LENGTH } from '../net/rating.js';

const BATTLE_MODES = [
  { id: 'cpu', label: 'CPU対戦' },
  { id: 'local', label: '2人対戦' },
  { id: 'online', label: 'オンライン対戦' },
];

/** オンライン対戦の参加方法。 */
const ONLINE_METHODS = [
  { id: 'create', label: '部屋を作る' },
  { id: 'join', label: 'コードで参加' },
  { id: 'random', label: 'ランダムマッチング' },
];

/**
 * CPU対戦の難易度レベルの表示ラベルを組み立てる。レベル1は既存のランダムCPU、
 * 最大レベルはGAN CPUモデルの最上位という位置づけを示すヒントを添える。
 * @param {number} level - CPUレベル（`RANDOM_CPU_LEVEL`〜`MAX_CPU_LEVEL`）
 * @returns {string} ボタンに表示するラベル
 */
const cpuLevelLabel = (level) => {
  if (level === RANDOM_CPU_LEVEL) return `レベル${level}（ランダム）`;
  if (level === MAX_CPU_LEVEL) return `レベル${level}（最強）`;
  return `レベル${level}`;
};

/**
 * 対局開始前に表示する、対戦モード→盤面サイズ→（モードに応じて）難易度/オンライン接続の
 * 選択画面を生成する。オンライン対戦では、この画面の中で実際に部屋の作成・参加・
 * ランダムマッチングまで完了させてから `onStart` を呼ぶ（対局画面側は接続済みの
 * 状態を受け取るだけでよい）。選択が完了すると自身をDOMから取り除く。
 * @param {HTMLElement} container - 追加先要素
 * @param {(selection: { battleMode: string, boardSize: number, cpuLevel: number | null, online: { roomId: string, color: number } | null, humanColor: number | null }) => void} onStart -
 *   選択完了時に呼ばれる。`cpuLevel` はCPU対戦モード以外では `null`。`online` は
 *   オンライン対戦モードでの接続確立後のみ非`null`（`roomId`と自分の色）。`humanColor` は
 *   CPU対戦モードで人間が選んだ先手/後手の色（`BLACK`/`WHITE`）で、それ以外のモードでは`null`
 * @param {() => void} [onFirstInteraction] - モード選択ボタンの最初のクリック時に呼ばれる。
 *   `<audio>.play()`はブラウザの自動再生ポリシー上、ボタン自身のクリックハンドラ内など
 *   ユーザー操作に直接応答する形で同期的に呼ばれた場合に最も確実に許可される
 *   （`document`への委譲リスナー経由だと、環境によっては許可されないことがある）ため、
 *   スタート画面BGMの起動はこのコールバック経由でボタンのハンドラ内から直接行うこと。
 * @returns {{ dispose: () => void }}
 */
export const createStartScreen = (container, onStart, onFirstInteraction) => {
  const overlay = document.createElement('div');
  overlay.className = 'start-screen';

  const title = document.createElement('h1');
  title.textContent = '高次元オセロ';
  overlay.appendChild(title);

  const subtitle = document.createElement('p');
  overlay.appendChild(subtitle);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'start-screen-modes';
  overlay.appendChild(buttonRow);

  const errorMessage = document.createElement('p');
  errorMessage.className = 'start-screen-error';
  overlay.appendChild(errorMessage);

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'start-screen-back';
  backButton.textContent = '← モード選択に戻る';
  backButton.hidden = true;
  overlay.appendChild(backButton);

  let selectedBattleMode = null;
  let selectedBoardSize = null;
  // CPU対戦の難易度は先手/後手選択ステップを挟んでから`finishSelection`に渡すため、
  // 選択直後は一旦ここに保持しておく。
  let selectedCpuLevel = null;
  // 「戻る」ボタンは1つ前のステップに戻す必要があるため、現在のステップを覚えておく。
  let currentStep = 'mode';
  // オンライン対戦の待機中(部屋作成・ランダムマッチング)はFirestoreを購読するため、
  // 別ステップに移動する・画面を閉じる際に必ず購読解除する。
  let activeUnsubscribe = null;
  let activeTicketId = null;

  const stopActiveSubscription = () => {
    if (activeUnsubscribe) {
      activeUnsubscribe();
      activeUnsubscribe = null;
    }
  };

  const cancelActiveTicketIfAny = () => {
    if (!activeTicketId) return;
    const ticketId = activeTicketId;
    activeTicketId = null;
    cancelRandomMatch(ticketId).catch((error) => {
      console.error('ランダムマッチングのキャンセルに失敗しました', error);
    });
  };

  const dispose = () => {
    stopActiveSubscription();
    cancelActiveTicketIfAny();
    overlay.remove();
  };

  const clearButtons = () => {
    buttonRow.replaceChildren();
  };

  const showError = (message) => {
    errorMessage.textContent = message;
  };

  const clearError = () => {
    errorMessage.textContent = '';
  };

  const finishSelection = ({ cpuLevel = null, online = null, humanColor = null } = {}) => {
    stopActiveSubscription();
    dispose();
    onStart({
      battleMode: selectedBattleMode,
      boardSize: selectedBoardSize,
      cpuLevel,
      online,
      humanColor,
    });
  };

  const showPlayerColorStep = () => {
    subtitle.textContent = '先手（黒）と後手（白）どちらでプレイしますか？';
    backButton.hidden = false;
    backButton.textContent = '← 難易度選択に戻る';
    currentStep = 'playerColor';
    clearButtons();

    const colorChoices = [
      { color: BLACK, label: '先手（黒）でプレイ' },
      { color: WHITE, label: '後手（白）でプレイ' },
    ];
    for (const { color, label } of colorChoices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        playClickSound();
        finishSelection({ cpuLevel: selectedCpuLevel, humanColor: color });
      });
      buttonRow.appendChild(button);
    }
  };

  const showCpuLevelStep = () => {
    subtitle.textContent = '難易度を選んでください';
    backButton.hidden = false;
    backButton.textContent = '← 盤面サイズ選択に戻る';
    currentStep = 'cpuLevel';
    clearButtons();

    for (let level = RANDOM_CPU_LEVEL; level <= MAX_CPU_LEVEL; level += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = cpuLevelLabel(level);
      button.addEventListener('click', () => {
        playClickSound();
        selectedCpuLevel = level;
        showPlayerColorStep();
      });
      buttonRow.appendChild(button);
    }
  };

  const showBoardSizeStep = () => {
    subtitle.textContent = '盤面サイズを選んでください';
    backButton.hidden = false;
    backButton.textContent = '← モード選択に戻る';
    currentStep = 'boardSize';
    clearError();
    clearButtons();

    for (const boardSize of SUPPORTED_BOARD_SIZES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${boardSize}×${boardSize}×${boardSize}`;
      button.addEventListener('click', () => {
        playClickSound();
        selectedBoardSize = boardSize;
        if (selectedBattleMode === 'cpu') {
          showCpuLevelStep();
          return;
        }
        if (selectedBattleMode === 'online') {
          showOnlineMethodStep();
          return;
        }
        finishSelection();
      });
      buttonRow.appendChild(button);
    }
  };

  const showOnlineWaitingStep = (message) => {
    subtitle.textContent = message;
    backButton.hidden = false;
    backButton.textContent = '← キャンセル';
    currentStep = 'onlineWaiting';
    clearButtons();
  };

  const startCreateRoom = async () => {
    clearError();
    showOnlineWaitingStep('部屋を作成しています…');
    try {
      const { roomId, color } = await createRoom(selectedBoardSize);
      showOnlineWaitingStep(
        `ルームコード: ${roomId}\nこのコードを相手に伝えてください。相手の参加を待っています…`,
      );
      activeUnsubscribe = subscribeToRoom(roomId, (room) => {
        if (room.status !== 'in_progress') return;
        stopActiveSubscription();
        finishSelection({ online: { roomId, color } });
      });
    } catch (error) {
      console.error('部屋の作成に失敗しました', error);
      showOnlineMethodStep();
      showError('部屋の作成に失敗しました。もう一度お試しください。');
    }
  };

  const showPlayerNameStep = () => {
    subtitle.textContent = 'ランダムマッチング（レート戦）にはプレイヤーネームが必要です';
    backButton.hidden = false;
    backButton.textContent = '← 参加方法選択に戻る';
    currentStep = 'playerName';
    clearError();
    clearButtons();

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = MAX_NAME_LENGTH;
    input.placeholder = '例: プレイヤー1';
    input.className = 'start-screen-text-input';
    buttonRow.appendChild(input);

    const submitButton = document.createElement('button');
    submitButton.type = 'button';
    submitButton.textContent = '決定してマッチング開始';
    submitButton.addEventListener('click', async () => {
      playClickSound();
      const name = input.value.trim();
      if (name.length === 0) {
        showError('プレイヤーネームを入力してください。');
        return;
      }
      clearError();
      submitButton.disabled = true;
      try {
        await createPlayerProfile(name);
        startRandomMatch();
      } catch (error) {
        submitButton.disabled = false;
        console.error('プレイヤープロフィールの作成に失敗しました', error);
        showError('プレイヤーネームの設定に失敗しました。もう一度お試しください。');
      }
    });
    buttonRow.appendChild(submitButton);
  };

  const startRandomMatch = async () => {
    clearError();
    // レート戦（ランダムマッチング）にはプレイヤーネームが必須。未設定なら先に設定させる
    // （[ranked-matchmaking](../../.claude/skills/ranked-matchmaking/SKILL.md)参照）。
    // プロフィール確認自体も失敗しうる(権限エラー・ネットワーク断)ため、この関数全体を
    // 1つのtry/catchで包む(ここだけ外に出すとエラー時に無反応のまま固まってしまう)。
    try {
      const profile = await getMyPlayerProfile();
      if (!profile) {
        showPlayerNameStep();
        return;
      }

      showOnlineWaitingStep('対戦相手を探しています…');
      const { ticketId, roomId } = await requestRandomMatch(selectedBoardSize);
      if (roomId) {
        // 自分が既存の待機チケットを見つけてマッチさせた側 = 白番。
        finishSelection({ online: { roomId, color: WHITE } });
        return;
      }
      activeTicketId = ticketId;
      activeUnsubscribe = subscribeToTicket(ticketId, (ticket) => {
        if (!ticket.roomId) return;
        // 他プレイヤーに見つけられてマッチした側 = 黒番。マッチ成立後はもう
        // キャンセル対象のチケットではないため、dispose時の誤キャンセルを防ぐ。
        activeTicketId = null;
        stopActiveSubscription();
        finishSelection({ online: { roomId: ticket.roomId, color: BLACK } });
      });
    } catch (error) {
      console.error('ランダムマッチングに失敗しました', error);
      showOnlineMethodStep();
      showError('ランダムマッチングに失敗しました。もう一度お試しください。');
    }
  };

  const showOnlineJoinStep = () => {
    subtitle.textContent = 'ルームコードを入力してください';
    backButton.hidden = false;
    backButton.textContent = '← 参加方法選択に戻る';
    currentStep = 'onlineJoin';
    clearError();
    clearButtons();

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = ROOM_CODE_LENGTH;
    input.placeholder = '例: AB23CD';
    input.className = 'start-screen-text-input start-screen-room-code-input';
    buttonRow.appendChild(input);

    const submitButton = document.createElement('button');
    submitButton.type = 'button';
    submitButton.textContent = '参加する';
    submitButton.addEventListener('click', async () => {
      playClickSound();
      if (!isValidRoomCode(input.value)) {
        showError('ルームコードの形式が正しくありません。');
        return;
      }
      clearError();
      submitButton.disabled = true;
      try {
        const { roomId, color } = await joinRoom(input.value);
        finishSelection({ online: { roomId, color } });
      } catch (error) {
        submitButton.disabled = false;
        if (error instanceof RoomNotFoundError) {
          showError('その部屋は見つかりませんでした。');
          return;
        }
        if (error instanceof RoomNotJoinableError) {
          showError('その部屋には参加できません（満室、または対局中です）。');
          return;
        }
        console.error('部屋への参加に失敗しました', error);
        showError('部屋への参加に失敗しました。もう一度お試しください。');
      }
    });
    buttonRow.appendChild(submitButton);
  };

  const showOnlineMethodStep = () => {
    subtitle.textContent = 'オンライン対戦の参加方法を選んでください';
    backButton.hidden = false;
    backButton.textContent = '← 盤面サイズ選択に戻る';
    currentStep = 'onlineMethod';
    clearError();
    clearButtons();

    if (!isFirebaseConfigured()) {
      showError('オンライン対戦は準備中です。しばらくお待ちください。');
      return;
    }

    const handlers = { create: startCreateRoom, join: showOnlineJoinStep, random: startRandomMatch };
    for (const method of ONLINE_METHODS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = method.label;
      button.addEventListener('click', () => {
        playClickSound();
        handlers[method.id]();
      });
      buttonRow.appendChild(button);
    }
  };

  const showBattleModeStep = () => {
    subtitle.textContent = '対戦モードを選んでください';
    backButton.hidden = true;
    currentStep = 'mode';
    clearError();
    clearButtons();

    for (const mode of BATTLE_MODES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = mode.label;
      button.addEventListener('click', () => {
        onFirstInteraction?.();
        playClickSound();
        selectedBattleMode = mode.id;
        showBoardSizeStep();
      });
      buttonRow.appendChild(button);
    }
  };

  backButton.addEventListener('click', () => {
    playClickSound();
    if (currentStep === 'playerColor') {
      showCpuLevelStep();
      return;
    }
    if (currentStep === 'cpuLevel' || currentStep === 'onlineMethod') {
      showBoardSizeStep();
      return;
    }
    if (currentStep === 'onlineJoin' || currentStep === 'playerName') {
      showOnlineMethodStep();
      return;
    }
    if (currentStep === 'onlineWaiting') {
      stopActiveSubscription();
      cancelActiveTicketIfAny();
      showOnlineMethodStep();
      return;
    }
    selectedBattleMode = null;
    selectedBoardSize = null;
    selectedCpuLevel = null;
    showBattleModeStep();
  });

  showBattleModeStep();
  container.appendChild(overlay);

  return { dispose };
};
