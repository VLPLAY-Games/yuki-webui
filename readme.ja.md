# Yuki WebUI

Yuki エコシステム向けの Web ダッシュボードです。静的ファイル/JS 製のダッシュボードを配信する小さな Flask アプリで、リアルタイムのデバイス状態、コマンド、メトリクス、グループ、タグ、管理操作（デバイスの承認/ブラックリスト登録、トークンのローテーション、監査ログ）のために `yuki-core` と直接 WebSocket で通信します。

## 必要要件

Python 3.10 以上。依存関係は `requirements.txt` で固定されています（`Flask==3.1.3`、`Werkzeug==3.1.8`、`requests==2.34.2`、`psutil==7.2.2`）。

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

デフォルトでは `127.0.0.1:5000` にバインドされます。

## ログイン

初回起動時からデフォルトのログイン情報として **`admin` / `admin`**（ハッシュ化して保存され、平文ではありません）が用意されており、そのままでも動作します - ログイン後は**必ず**ダッシュボードの設定パネルから変更してください。`WEBUI_USER`/`WEBUI_PASS` 環境変数を設定すれば、ファイルベースの認証情報を完全にバイパスすることもできます。

## 設定（環境変数）

| 変数 | デフォルト | 用途 |
|---|---|---|
| `SECRET_KEY` | （自動生成） | Flask のセッション署名キー。未設定の場合、ランダムなキーが一度だけ生成され `.flask_secret`（パーミッション600）に保存されます。 |
| `WEBUI_USER` / `WEBUI_PASS` | 未設定 | `.credentials` ファイルを完全に上書きします。 |
| `YUKI_WEBUI_DEBUG` | 未設定 | Flask のデバッグモード（インタラクティブデバッガ - ローカル開発専用、絶対に外部へ公開しないでください）を有効にします。 |
| `YUKI_WEBUI_HOST` | `127.0.0.1` | バインドアドレス。LAN 上の他のデバイスからアクセスできるようにするには `0.0.0.0` に設定します。 |
| `YUKI_WEBUI_TLS_ENABLED` | 未設定 | 真値を設定すると HTTP の代わりに HTTPS で待ち受けます - 下記の2つの変数も必要です。 |
| `YUKI_WEBUI_TLS_CERT` / `YUKI_WEBUI_TLS_KEY` | 未設定 | TLS 有効時に使用する PEM 形式の証明書/鍵のパス。 |
| `YUKI_CORE_TOKEN_FILE` | `../yuki-core/.token`（このリポジトリからの相対パス） | ダッシュボード自身の `/webui` WebSocket 接続を認証するために、`yuki-core` の認証トークンをどこから読み込むか。`yuki-core` がこのリポジトリの隣にチェックアウトされていない場合はここを上書きしてください。 |

暗号化はエコシステムの他の部分と同様に**デフォルトでオフ**です。`SESSION_COOKIE_SECURE` は `YUKI_WEBUI_TLS_ENABLED` に自動的に追従します。

## `yuki-core` との接続方法

ダッシュボードのリアルタイム機能は、ブラウザから `yuki-core` の `/webui` への直接 WebSocket 接続で動作します（この Flask アプリを経由したプロキシではありません）。このソケットは権限の高い操作を扱うため、ブラウザは接続直後に自身を認証します。具体的には、このアプリ自身の `GET /api/core-token`（利用には事前にここへログインしている必要があります）から現在の core トークンを取得し、それをソケット上で最初のメッセージとして送信します。`yuki-core` は他の処理を受け付ける前にこれを検証します。

## データファイル

`dashboard_data.json`（グループ/タグ/ウィジェットレイアウト）、`.credentials`（ハッシュ化されたユーザー名/パスワード、パーミッション600）、`.flask_secret`（パーミッション600）、`logs/`（実行ごとに1ファイル）。

## プロトコル

`static/libs/yuki-protocol/` に同梱されたコピーを通じて Yuki Protocol `yuki/1.0` を使用します（バックエンド自身のメッセージヘルパー用に Python、ブラウザ用に JavaScript）- 詳しくは [`yuki-protocol`](../yuki-protocol) を参照してください。
