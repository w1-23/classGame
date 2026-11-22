using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("\u5B66\u4E60\u95EF\u5173\u4E50\u56ED")]
[assembly: AssemblyDescription("\u5B66\u4E60\u95EF\u5173\u4E50\u56ED\u542F\u52A8\u5668")]
[assembly: AssemblyProduct("\u5B66\u4E60\u95EF\u5173\u4E50\u56ED")]

namespace ClassGameLauncher
{
    internal static class Program
    {
        private const string CoreExecutable = "\u5B66\u4E60\u95EF\u5173\u4E50\u56ED-core.exe";
        private const string LogFileName = "classGame-launcher.log";

        [STAThread]
        private static void Main()
        {
            try
            {
                string applicationDirectory = Path.GetDirectoryName(Application.ExecutablePath);
                string corePath = Path.Combine(applicationDirectory, CoreExecutable);

                if (!File.Exists(corePath))
                {
                    ShowError("找不到游戏主程序：" + corePath);
                    return;
                }

                ProcessStartInfo startInfo = new ProcessStartInfo(corePath, "--no-sandbox")
                {
                    WorkingDirectory = applicationDirectory,
                    UseShellExecute = false
                };

                using (Process process = Process.Start(startInfo))
                {
                    if (process == null)
                    {
                        ShowError("游戏主程序未能启动。");
                        return;
                    }

                    process.WaitForExit();
                }
            }
            catch (Exception exception)
            {
                WriteLog(exception);
                ShowError("游戏启动失败：" + exception.Message);
            }
        }

        private static void WriteLog(Exception exception)
        {
            try
            {
                string logPath = Path.Combine(Path.GetTempPath(), LogFileName);
                File.AppendAllText(
                    logPath,
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + Environment.NewLine +
                    exception + Environment.NewLine + Environment.NewLine
                );
            }
            catch
            {
            }
        }

        private static void ShowError(string message)
        {
            MessageBox.Show(
                message,
                "\u5B66\u4E60\u95EF\u5173\u4E50\u56ED",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }
}
