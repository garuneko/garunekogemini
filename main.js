const { app, BrowserWindow, ipcMain, dialog, Menu, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');
const historyPath = path.join(userDataPath, 'history.json'); // 履歴ファイル追加

let genAI = null;
let chatSession = null;

// --- ファイル読み書きヘルパー ---
function loadConfig() {
  if (!fs.existsSync(configPath)) return { model: "gemini-2.5-flash" };
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!config.model) config.model = "gemini-2.5-flash";
    return config;
  } catch (err) {
    return { model: "gemini-2.5-flash" };
  }
}

function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function loadHistory() {
  if (!fs.existsSync(historyPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
  } catch (err) {
    return [];
  }
}

function saveHistory(historyData) {
  fs.writeFileSync(historyPath, JSON.stringify(historyData, null, 2));
}

// --- API初期化・キー復号処理 ---
function getDecryptedApiKey(config) {
  if (config.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
    try {
      const buffer = Buffer.from(config.encryptedApiKey, 'base64');
      return safeStorage.decryptString(buffer);
    } catch (err) {
      console.error('APIキー復号エラー:', err);
      return null;
    }
  }
  return config.apiKey || null; // V1からの移行用フォールバック
}

function initAI(apiKey, modelName) {
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    // 過去の履歴を読み込んでセッションを開始
    const historyData = loadHistory();
    chatSession = model.startChat({ history: historyData });
    console.log(`Ready: ${modelName} (履歴: ${historyData.length}件)`);
  } catch (e) {
    console.error("Initialization Error:", e);
  }
}

// --- 起動処理 ---
app.whenReady().then(() => {
  const currentConfig = loadConfig();
  const apiKey = getDecryptedApiKey(currentConfig);
  if (apiKey) {
    initAI(apiKey, currentConfig.model);
  }

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
});

// --- IPC通信 ---
ipcMain.handle('check-auth', () => !!genAI);

ipcMain.handle('get-current-model', () => {
  return loadConfig().model || "gemini-2.5-flash";
});

// UI起動時に過去の会話をレンダラーに渡す用
ipcMain.handle('get-history-for-ui', async () => {
  if (!chatSession) return [];
  try {
    const history = await chatSession.getHistory();
    return history.map(item => ({
      role: item.role === 'user' ? 'user' : 'ai',
      text: item.parts[0].text
    }));
  } catch (err) {
    return [];
  }
});

ipcMain.handle('change-model', async (event, newModelName) => {
  const config = loadConfig();
  config.model = newModelName;
  saveConfig(config);

  if (genAI) {
    const model = genAI.getGenerativeModel({ model: newModelName });
    // モデル切り替え時も現在の履歴を引き継ぐ
    const currentHistory = chatSession ? await chatSession.getHistory() : loadHistory();
    chatSession = model.startChat({ history: currentHistory }); 
    return { success: true };
  }
  return { error: "APIキーが設定されていません。" };
});

ipcMain.handle('save-api-key', async (event, key) => {
  try {
    const testAI = new GoogleGenerativeAI(key);
    const config = loadConfig();
    const modelName = config.model || "gemini-2.5-flash";

    const testModel = testAI.getGenerativeModel({ model: modelName });
    await testModel.generateContent("test");

    // safeStorageによる暗号化保存
    if (safeStorage.isEncryptionAvailable()) {
      const encryptedBuffer = safeStorage.encryptString(key);
      config.encryptedApiKey = encryptedBuffer.toString('base64');
      if (config.apiKey) delete config.apiKey; // 平文キーは削除
    } else {
      config.apiKey = key;
    }
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
    // 送信成功後、最新の履歴を保存
    const updatedHistory = await chatSession.getHistory();
    saveHistory(updatedHistory);
    
    return { text: result.response.text() };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('generate-image', async (event, prompt) => {
  if (!genAI) return { error: "APIキーが設定されていません。" };
  try {
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
