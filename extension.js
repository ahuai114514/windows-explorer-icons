'use strict';

const vscode = require('vscode');
const { generateTheme, needsGeneration } = require('./generator');

const themeId = 'ahuai-windows-explorer-icons';
const refreshCommand = 'windowsExplorerIcons.refresh';
const extraExtensionsSetting = 'windowsExplorerIcons.extraExtensions';

function activate(context) {
  let pending;

  async function refresh(manual) {
    if (process.platform !== 'win32') {
      if (manual) void vscode.window.showWarningMessage('此图标主题需要 Windows 桌面版 VS Code。');
      return;
    }

    if (pending) await pending;
    if (pending) return refresh(manual);

    const extra = vscode.workspace.getConfiguration().get(extraExtensionsSetting, []);
    pending = (async () => {
      if (!manual && !(await needsGeneration(context.extensionPath, extra))) return;
      const count = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '正在读取 Windows 文件图标…' },
        () => generateTheme(context.extensionPath, extra)
      );
      if (manual) {
        const reload = '重新加载窗口';
        void vscode.window.showInformationMessage(`已刷新 Windows 图标，覆盖 ${count} 种扩展名。`, reload)
          .then(choice => choice === reload && vscode.commands.executeCommand('workbench.action.reloadWindow'));
      }
    })().catch(error => {
      console.error('Windows Explorer Icons:', error);
      void vscode.window.showErrorMessage(`Windows 图标生成失败：${error.message}`);
    }).finally(() => { pending = undefined; });
    return pending;
  }

  function refreshSelectedTheme() {
    if (vscode.workspace.getConfiguration().get('workbench.iconTheme') === themeId) void refresh(false);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(refreshCommand, () => refresh(true)),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('workbench.iconTheme') || event.affectsConfiguration(extraExtensionsSetting)) {
        refreshSelectedTheme();
      }
    })
  );
  refreshSelectedTheme();
}

module.exports = { activate };
