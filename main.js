const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const configPath = path.join(app.getPath('userData'), 'config.json');
let genAI = null;
let chatSession = null;

// main.js の初期化部分を少し修正
function initAI(apiKey) {
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    
    // 環境変数、またはアプリ名に "Free" が含まれているかで判定
    const isFree = process.env.MODEL_TYPE === 'free' || process.execPath.includes('Free') || app.getName().includes('Free');
    const chatModelName = isFree ? "gemini-2.5-flash" : "gemini-3-pro-preview";
    const model = genAI.getGenerativeModel({ model: chatModelName });
    chatSession = model.startChat({ history: [] });
    console.log(`Mode: ${isFree ? 'FREE' : 'PRO'} (${chatModelName})`);
  } catch (e) {
    console.error("Initialization Error:", e);
  }
}
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (config.apiKey) initAI(config.apiKey);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    title: "Gemini Client for garuneko",
    webPreferences: {
      nodeIntegration: true,  
      contextIsolation: false
    }
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

ipcMain.handle('check-auth', () => !!genAI);

ipcMain.handle('save-api-key', async (event, key) => {
  try {
    const testAI = new GoogleGenerativeAI(key);

    const isFree = process.env.MODEL_TYPE === 'free' || process.execPath.includes('Free') || app.getName().includes('Free');
const chatModelName = isFree ? "gemini-2.5-flash" : "gemini-3-pro-preview";
    const appName = app.getName();

    // テスト通信
    const testModel = testAI.getGenerativeModel({ model: chatModelName });
    await testModel.generateContent("test");

    fs.writeFileSync(configPath, JSON.stringify({ apiKey: key }));
    initAI(key);
    return { success: true };
  } catch (error) {
    // エラーの中身（503など）
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
