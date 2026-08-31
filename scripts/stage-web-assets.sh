#!/bin/bash
# ゲーム本体の実行に必要な最小限のファイル(index.html/privacy.html/src/data/package.json)を
# 指定ディレクトリにコピーする。GitHub Pages公開(.github/workflows/deploy.yml)と
# iOSアプリへのオフライン同梱(ios-app/www/)の両方がこのスクリプトを使うことで、
# 「公開対象ファイル一覧」が2箇所に分散して食い違うのを防ぐ。
# 正本: .claude/skills/ios-native-packaging/SKILL.md の「Web資産の同梱」節。
#
# 使い方: scripts/stage-web-assets.sh <dest-dir>
#
# macOS標準のbash(3.2系)でも動くよう、bash4以降専用の構文は使わない。

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <dest-dir>" >&2
  exit 1
fi

dest_dir="$1"
repo_root="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$dest_dir"
cp "$repo_root/index.html" "$repo_root/package.json" "$repo_root/privacy.html" "$dest_dir/"

# rsyncを使うのは2つの理由から: (1) cp -r は宛先ディレクトリが既に存在すると
# 上書きではなく入れ子になってしまう(www/src/src/...のような蓄積が発生する)ため、
# 再実行しても安全な同期にする。(2) *.test.js を公開物・アプリ本体から除外する
# (これまで誤って同梱されていた)。--delete で削除されたソースファイルも追従する。
rsync -a --delete --exclude='*.test.js' "$repo_root/src/" "$dest_dir/src/"
rsync -a --delete "$repo_root/data/" "$dest_dir/data/"

echo "staged web assets into $dest_dir"
