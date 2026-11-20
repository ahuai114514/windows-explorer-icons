param(
    [Parameter(Mandatory = $true)][string] $OutputDirectory,
    [Parameter(Mandatory = $true)][string] $ExtensionList
)

$ErrorActionPreference = 'Stop'

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class ExplorerIcon
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ShellFileInfo
    {
        public IntPtr Icon;
        public int Index;
        public uint Attributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string DisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)] public string TypeName;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern IntPtr SHGetFileInfoW(string path, uint attributes, out ShellFileInfo info, uint size, uint flags);

    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr icon);

    public static bool Save(string name, bool folder, bool open, string output)
    {
        const uint icon = 0x100;
        const uint useFileAttributes = 0x10;
        const uint openIcon = 0x2;
        const uint directory = 0x10;
        const uint normalFile = 0x80;
        ShellFileInfo info;
        uint flags = icon | useFileAttributes | (open ? openIcon : 0);
        IntPtr success = SHGetFileInfoW(name, folder ? directory : normalFile, out info,
            (uint)Marshal.SizeOf(typeof(ShellFileInfo)), flags);
        if (success == IntPtr.Zero || info.Icon == IntPtr.Zero) return false;

        try
        {
            using (Icon shellIcon = Icon.FromHandle(info.Icon))
            using (Bitmap bitmap = shellIcon.ToBitmap())
                bitmap.Save(output, ImageFormat.Png);
            return true;
        }
        finally
        {
            DestroyIcon(info.Icon);
        }
    }
}
'@

if (-not [ExplorerIcon]::Save('sample', $false, $false, (Join-Path $OutputDirectory 'file.png'))) {
    throw 'Windows Shell did not return a generic file icon.'
}
if (-not [ExplorerIcon]::Save('sample', $true, $false, (Join-Path $OutputDirectory 'folder.png'))) {
    throw 'Windows Shell did not return a folder icon.'
}
$openFolder = Join-Path $OutputDirectory 'folder-open.png'
if (-not [ExplorerIcon]::Save('sample', $true, $true, $openFolder)) {
    Copy-Item -LiteralPath (Join-Path $OutputDirectory 'folder.png') -Destination $openFolder
}

foreach ($extension in ($ExtensionList -split ',')) {
    if ($extension -cmatch '\A[a-z0-9][a-z0-9_+-]{0,31}\z') {
        [void] [ExplorerIcon]::Save("sample.$extension", $false, $false, (Join-Path $OutputDirectory "ext-$extension.png"))
    }
}
