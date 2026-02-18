# garunekogemini

Gemini APIを使って、文章生成・画像生成ができるデスクトップクライアントアプリです。Google AI StudioでAPIキーを取得してご利用ください。

## 主な機能
- **テキスト生成**: Gemini APIを使った自然な会話
- **画像生成**: プロンプトから画像を生成

## 使い方
- **通常チャット**: テキストを入力して送信
- **画像生成**: プロンプトの先頭に `/img` を付けて送信

### 使用例
```
/img りんごとはちみつのカレー
```

## ダウンロード
[Releases](https://github.com/garuneko/garunekogemini/releases)ページから最新版をダウンロードしてください。

## セットアップ
1. [Google AI Studio](https://aistudio.google.com/)でAPIキーを取得
2. アプリを起動し、設定画面でAPIキーを入力

## Mac版をご利用の方へ（初回起動時の注意）

macOSのセキュリティ機能（Gatekeeper）により、初回起動時に**「壊れているため開けません。ゴミ箱に入れる必要があります」**などの警告が表示される場合があります。

本アプリはAppleの有料開発者証明書で署名していないため、この警告が表示される場合があります。

### ブロックの解除手順（初回のみ）

1. ダウンロードした `.dmg` を開き、中にあるアプリを **「アプリケーション」フォルダ** にドラッグ＆ドロップしてコピーします
2. **「ターミナル」** アプリを開きます（`Finder` → `アプリケーション` → `ユーティリティ` → `ターミナル`）
3. 以下のコマンドをコピー＆ペーストして実行します
```bash
sudo xattr -rd com.apple.quarantine "/Applications/GarunekoGemini.app"
```

4. Macのログインパスワードを入力してEnterキーを押します（入力中は画面に文字が表示されませんが正常です）
5. エラーが出なければ完了です。アプリケーションフォルダからアプリを起動してください

## 動作環境
- **Windows**: Windows 10以降
- **macOS**: macOS 11 (Big Sur) 以降

## ライセンス
MIT License

## 開発者
がる ([@garuneko](https://garuneko.com))
