# GANベースCPU対戦相手の学習用コンテナ。
# RTX 4060 (Ada Lovelace, CUDA 12.8) を想定し、GPU版PyTorchの公式イメージをベースにする。
FROM pytorch/pytorch:2.9.1-cuda12.8-cudnn9-runtime

# ruff(フォーマッタ/リンタ)・pytestは開発時に毎回使うため、イメージにあらかじめ含める。
# onnxruntimeは、ブラウザ推論用にエクスポートしたONNXモデルがPyTorch側の出力と一致する
# ことを検証するテスト専用(CPU版で十分、Python側で推論性能は求めない)。
# 学習コードに新たな依存関係が必要になった場合はここに追記する。
RUN pip install --no-cache-dir ruff pytest onnx onnxruntime

WORKDIR /workspace
