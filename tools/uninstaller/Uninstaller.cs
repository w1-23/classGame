using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("\u5378\u8F7D\u5B66\u4E60\u95EF\u5173\u4E50\u56ED")]
[assembly: AssemblyDescription("\u5B66\u4E60\u95EF\u5173\u4E50\u56ED\u5378\u8F7D\u7A0B\u5E8F")]
[assembly: AssemblyProduct("\u5B66\u4E60\u95EF\u5173\u4E50\u56ED")]

namespace ClassGameUninstaller
{
    internal static class Program
    {
        private const string ProductName = "\u5B66\u4E60\u95EF\u5173\u4E50\u56ED";
        private const string MainExecutableName = ProductName + ".exe";
        private const string CoreExecutableName = ProductName + "-core.exe";
        private const string LogFileName = "classGame-uninstaller.log";
        private const int MoveFileDelayUntilReboot = 0x00000004;

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool MoveFileEx(string existingFileName, string newFileName, int flags);

        [STAThread]
        private static void Main(string[] args)
        {
            try
            {
                if (args.Length >= 2 && string.Equals(args[0], "--cleanup", StringComparison.OrdinalIgnoreCase))
                {
                    RunCleanup(args);
                    return;
                }

                bool silent = ContainsArgument(args, "/S");
                if (!silent)
                {
                    DialogResult result = MessageBox.Show(
                        "确定要卸载“学习闯关乐园”吗？\n\n学习进度会保留。",
                        ProductName,
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Question
                    );

                    if (result != DialogResult.Yes)
                    {
                        return;
                    }
                }

                string applicationDirectory = Path.GetDirectoryName(Application.ExecutablePath);
                RunCleanup(applicationDirectory, silent);
            }
            catch (Exception exception)
            {
                WriteLog(exception);
                if (!ContainsArgument(args, "/S"))
                {
                    ShowError("卸载失败：" + exception.Message);
                }
            }
        }

        private static void RunCleanup(string[] args)
        {
            string applicationDirectory = Path.GetFullPath(args[1]);
            bool silent = ContainsArgument(args, "--silent");
            RunCleanup(applicationDirectory, silent);
        }

        private static void RunCleanup(string applicationDirectory, bool silent)
        {
            bool removalScheduled = false;
            try
            {
                ValidateApplicationDirectory(applicationDirectory);
                StopApplicationProcesses(applicationDirectory);
                DeleteShortcuts();
                DeleteRegistryEntries(applicationDirectory);
                DeleteApplicationContents(applicationDirectory);
                ScheduleApplicationDirectoryRemoval(applicationDirectory);
                removalScheduled = true;

                if (!silent)
                {
                    MessageBox.Show(
                        "“学习闯关乐园”已卸载。\n\n学习进度仍保留在电脑中。",
                        ProductName,
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
            }
            catch (Exception exception)
            {
                WriteLog(exception);
                if (!silent)
                {
                    ShowError("卸载未完全完成：" + exception.Message + "\n\n可以重新运行卸载程序。");
                }
            }
            finally
            {
                if (!removalScheduled)
                {
                    MoveFileEx(Application.ExecutablePath, null, MoveFileDelayUntilReboot);
                    MoveFileEx(applicationDirectory, null, MoveFileDelayUntilReboot);
                }
            }
        }

        private static void ValidateApplicationDirectory(string applicationDirectory)
        {
            string fullPath = Path.GetFullPath(applicationDirectory).TrimEnd('\\');
            if (fullPath.Length <= 3)
            {
                throw new InvalidOperationException("拒绝删除磁盘根目录。");
            }

            string mainExecutable = Path.Combine(fullPath, MainExecutableName);
            string coreExecutable = Path.Combine(fullPath, CoreExecutableName);
            if (!File.Exists(mainExecutable) && !File.Exists(coreExecutable))
            {
                throw new InvalidOperationException("目标目录中未找到学习闯关乐园程序文件。");
            }
        }

        private static void StopApplicationProcesses(string applicationDirectory)
        {
            string normalizedDirectory = Path.GetFullPath(applicationDirectory).TrimEnd('\\') + "\\";
            int currentProcessId = Process.GetCurrentProcess().Id;

            foreach (Process process in Process.GetProcesses())
            {
                try
                {
                    if (process.Id == currentProcessId)
                    {
                        continue;
                    }

                    string processName = process.ProcessName + ".exe";
                    if (!string.Equals(processName, MainExecutableName, StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(processName, CoreExecutableName, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    string executablePath = Path.GetFullPath(process.MainModule.FileName);
                    if (!executablePath.StartsWith(normalizedDirectory, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    process.Kill();
                    process.WaitForExit(4000);
                }
                catch
                {
                }
                finally
                {
                    process.Dispose();
                }
            }
        }

        private static void DeleteShortcuts()
        {
            string shortcutName = ProductName + ".lnk";
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.Programs);

            DeleteFileIfExists(Path.Combine(desktop, shortcutName));
            DeleteFilesRecursively(startMenu, shortcutName);

            string startMenuProductDirectory = Path.Combine(startMenu, ProductName);
            if (Directory.Exists(startMenuProductDirectory))
            {
                try
                {
                    Directory.Delete(startMenuProductDirectory, true);
                }
                catch
                {
                }
            }
        }

        private static void DeleteFilesRecursively(string directory, string fileName)
        {
            if (!Directory.Exists(directory))
            {
                return;
            }

            try
            {
                foreach (string file in Directory.EnumerateFiles(directory, fileName, SearchOption.AllDirectories))
                {
                    DeleteFileIfExists(file);
                }
            }
            catch
            {
            }
        }

        private static void DeleteFileIfExists(string filePath)
        {
            try
            {
                if (File.Exists(filePath))
                {
                    File.SetAttributes(filePath, FileAttributes.Normal);
                    File.Delete(filePath);
                }
            }
            catch
            {
            }
        }

        private static void DeleteRegistryEntries(string applicationDirectory)
        {
            RegistryKey[] hives = new RegistryKey[] { Registry.CurrentUser, Registry.LocalMachine };
            string[] uninstallRoots = new string[]
            {
                @"Software\Microsoft\Windows\CurrentVersion\Uninstall",
                @"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
            };

            foreach (RegistryKey hive in hives)
            {
                foreach (string rootPath in uninstallRoots)
                {
                    try
                    {
                        DeleteMatchingUninstallEntries(hive, rootPath, applicationDirectory);
                    }
                    catch (Exception)
                    {
                    }
                }

                try
                {
                    DeleteInstallMarker(hive, applicationDirectory);
                }
                catch (Exception)
                {
                }
            }
        }

        private static void DeleteMatchingUninstallEntries(
            RegistryKey hive,
            string rootPath,
            string applicationDirectory
        )
        {
            using (RegistryKey root = hive.OpenSubKey(rootPath, true))
            {
                if (root == null)
                {
                    return;
                }

                string[] subKeyNames = root.GetSubKeyNames();
                foreach (string subKeyName in subKeyNames)
                {
                    using (RegistryKey subKey = root.OpenSubKey(subKeyName, false))
                    {
                        if (subKey == null)
                        {
                            continue;
                        }

                        string displayName = subKey.GetValue("DisplayName") as string;
                        string installLocation = subKey.GetValue("InstallLocation") as string;
                        bool nameMatches = !string.IsNullOrEmpty(displayName) &&
                            displayName.IndexOf(ProductName, StringComparison.OrdinalIgnoreCase) >= 0;
                        bool pathMatches = PathsEqual(installLocation, applicationDirectory);

                        if (nameMatches || pathMatches)
                        {
                            root.DeleteSubKeyTree(subKeyName, false);
                        }
                    }
                }
            }
        }

        private static void DeleteInstallMarker(RegistryKey hive, string applicationDirectory)
        {
            using (RegistryKey software = hive.OpenSubKey("Software", true))
            {
                if (software == null)
                {
                    return;
                }

                string[] subKeyNames = software.GetSubKeyNames();
                foreach (string subKeyName in subKeyNames)
                {
                    if (string.Equals(subKeyName, "Microsoft", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(subKeyName, "Classes", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    using (RegistryKey subKey = software.OpenSubKey(subKeyName, false))
                    {
                        if (subKey == null)
                        {
                            continue;
                        }

                        string installLocation = subKey.GetValue("InstallLocation") as string;
                        if (PathsEqual(installLocation, applicationDirectory))
                        {
                            software.DeleteSubKeyTree(subKeyName, false);
                        }
                    }
                }
            }
        }

        private static bool PathsEqual(string first, string second)
        {
            if (string.IsNullOrEmpty(first) || string.IsNullOrEmpty(second))
            {
                return false;
            }

            try
            {
                return string.Equals(
                    Path.GetFullPath(first).TrimEnd('\\'),
                    Path.GetFullPath(second).TrimEnd('\\'),
                    StringComparison.OrdinalIgnoreCase
                );
            }
            catch
            {
                return false;
            }
        }

        private static void DeleteApplicationContents(string applicationDirectory)
        {
            string currentExecutable = Path.GetFullPath(Application.ExecutablePath);

            for (int attempt = 0; attempt < 20; attempt++)
            {
                bool deletionPending = false;

                foreach (string entry in Directory.EnumerateFileSystemEntries(applicationDirectory))
                {
                    if (PathsEqual(entry, currentExecutable))
                    {
                        continue;
                    }

                    try
                    {
                        if (Directory.Exists(entry))
                        {
                            NormalizeFileAttributes(entry);
                            Directory.Delete(entry, true);
                        }
                        else if (File.Exists(entry))
                        {
                            File.SetAttributes(entry, FileAttributes.Normal);
                            File.Delete(entry);
                        }
                    }
                    catch (IOException)
                    {
                        deletionPending = true;
                    }
                    catch (UnauthorizedAccessException)
                    {
                        deletionPending = true;
                    }
                }

                if (!deletionPending)
                {
                    return;
                }

                Thread.Sleep(250);
            }
        }

        private static void ScheduleApplicationDirectoryRemoval(string applicationDirectory)
        {
            string commandPath = Path.Combine(Environment.SystemDirectory, "cmd.exe");
            string arguments =
                "/d /c ping 127.0.0.1 -n 4 >nul & rmdir /s /q \"" +
                applicationDirectory.TrimEnd('\\') +
                "\"";

            ProcessStartInfo startInfo = new ProcessStartInfo(commandPath, arguments)
            {
                WorkingDirectory = Path.GetTempPath(),
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };

            using (Process process = Process.Start(startInfo))
            {
                if (process == null)
                {
                    throw new InvalidOperationException("无法启动安装目录清理进程。");
                }
            }
        }

        private static void NormalizeFileAttributes(string directory)
        {
            foreach (string file in Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories))
            {
                try
                {
                    File.SetAttributes(file, FileAttributes.Normal);
                }
                catch
                {
                }
            }
        }

        private static bool ContainsArgument(string[] args, string expected)
        {
            foreach (string argument in args)
            {
                if (string.Equals(argument, expected, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
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
                ProductName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }
}
