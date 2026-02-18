const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const configPath = path.join(app.getPath('userData'), 'config.json');
let genAI = null;
let chatSession = null;

// 設定ファイルの読み書きヘルパー
function loadConfig() {
  if (!fs.existsSync(configPath)) return { model: "gemini-2.5-flash" };
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!config.model) config.model = "gemini-2.5-flash"; // デフォルト
    return config;
  } catch (err) {
    return { model: "gemini-2.5-flash" };
  }
}

function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// AI初期化処理
function initAI(apiKey, modelName) {
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    // ※Step 3（履歴保持）でここに過去のhistoryを渡す処理を追加します
    chatSession = model.startChat({ history: [] });
    console.log(`Ready: ${modelName}`);
  } catch (e) {
    console.error("Initialization Error:", e);
  }
}

// アプリ起動時の読み込み
const currentConfig = loadConfig();
// ※Step 1のsafeStorageを実装した場合は、ここで復号したキーを渡します
if (currentConfig.apiKey) {
  initAI(currentConfig.apiKey, currentConfig.model);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    title: "GarunekoGemini v2",
    webPreferences: {
      nodeIntegration: true,  
      contextIsolation: false
    }
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

ipcMain.handle('check-auth', () => !!genAI);

// モデル切り替えハンドラ（UIのプルダウン等から呼ばれる想定）
ipcMain.handle('change-model', (event, newModelName) => {
  const config = loadConfig();
  config.model = newModelName;
  saveConfig(config);

  if (genAI) {
    // APIキー設定済みなら即座にチャットセッションを切り替え
    const model = genAI.getGenerativeModel({ model: newModelName });
    // ※ここもStep 3で現在の会話履歴を引き継ぐように改修します
    chatSession = model.startChat({ history: [] }); 
    return { success: true };
  }
  return { error: "APIキーが設定されていません。" };
});

ipcMain.handle('save-api-key', async (event, key) => {
  try {
    const testAI = new GoogleGenerativeAI(key);
    const config = loadConfig();
    const modelName = config.model || "gemini-2.5-flash";

    // テスト通信
    const testModel = testAI.getGenerativeModel({ model: modelName });
    await testModel.generateContent("test");

    // ※Step 1のsafeStorageの保存処理をここに組み込みます
    config.apiKey = key;
    saveConfig(config);
    
    initAI(key, modelName);
    return { success: true };
  } catch (error) {
    return { error: `エラー: ${error.message}` };
  }
});

ipcMain.handle('send-to-gemini', async (event, text) => {
  if (!chatSession) return { error: "APIキーが設定されていません。" };
  try {
    const result = await chatSession.sendMessage(text);
    return { text: result.response.text() };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('generate-image', async (event, prompt) => {
  if (!genAI) return { error: "APIキーが設定されていません。" };
  try {
    // 画像生成モデルは固定
    const imageModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });
    const result = await imageModel.generateContent(prompt);
    const parts = result.response.candidates[0].content.parts;
    const imagePart = parts.find(part => part.inlineData);
    if (!imagePart) return { error: "画像が生成されませんでした" };
    return { image: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}` };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.on('show-context-menu', (event, base64Data) => {
  const template = [{
    label: '画像を保存する',
    click: async () => {
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches) return;
      let ext = matches[1].split('/')[1] === 'jpeg' ? 'jpg' : matches[1].split('/')[1];
      const { filePath } = await dialog.showSaveDialog({ defaultPath: `nano-banana-${Date.now()}.${ext}` });
      if (filePath) fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
    }
  }];
  Menu.buildFromTemplate(template).popup(BrowserWindow.fromWebContents(event.sender));
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
