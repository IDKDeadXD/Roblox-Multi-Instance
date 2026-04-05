# Closes the ROBLOX_singletonMutex handle from within RobloxPlayerBeta.exe
# using DuplicateHandle(DUPLICATE_CLOSE_SOURCE), which removes the handle
# from the target process so a second instance can be launched.

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;

public static class MutexCloser {
    const uint STATUS_INFO_LENGTH_MISMATCH = 0xC0000004;
    const uint PROCESS_DUP_HANDLE   = 0x00000040;
    const uint DUPLICATE_CLOSE_SOURCE = 0x00000001;
    const uint SystemHandleInformation = 16;
    const uint ObjectNameInformation   = 1;

    [DllImport("ntdll.dll")]
    static extern uint NtQuerySystemInformation(uint cls, IntPtr buf, uint len, out uint rlen);
    [DllImport("ntdll.dll")]
    static extern uint NtQueryObject(IntPtr h, uint cls, IntPtr buf, uint len, out uint rlen);
    [DllImport("kernel32.dll")]
    static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll")]
    static extern bool DuplicateHandle(IntPtr sp, IntPtr sh, IntPtr tp, out IntPtr th, uint access, bool inherit, uint opts);
    [DllImport("kernel32.dll")]
    static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr h);

    // SYSTEM_HANDLE_TABLE_ENTRY_INFO layout on 64-bit Windows:
    //   Offset 0: USHORT UniqueProcessId    (2)
    //   Offset 2: USHORT CreatorBTI         (2)
    //   Offset 4: UCHAR  ObjectTypeIndex    (1)
    //   Offset 5: UCHAR  HandleAttributes   (1)
    //   Offset 6: USHORT HandleValue        (2)
    //   Offset 8: PVOID  Object             (8)  <- naturally aligned
    //   Offset 16: ULONG GrantedAccess      (4)
    //   Offset 20: padding                  (4)
    //   Total: 24 bytes
    //
    // SYSTEM_HANDLE_INFORMATION:
    //   Offset 0: ULONG NumberOfHandles     (4)
    //   Offset 4: (4 bytes padding on 64-bit to align first entry's Object)
    //   Offset 8: Handles[0] starts here

    static readonly int IS64 = IntPtr.Size == 8 ? 1 : 0;
    static readonly int ENTRY_SIZE  = IntPtr.Size == 8 ? 24 : 16;
    static readonly int FIRST_ENTRY = IntPtr.Size == 8 ?  8 :  4;

    public static int Release(string procName, string mutexFragment) {
        uint sz = 0x20000;
        IntPtr buf;
        uint rlen;

        while (true) {
            buf = Marshal.AllocHGlobal((int)sz);
            uint st = NtQuerySystemInformation(SystemHandleInformation, buf, sz, out rlen);
            if (st == 0) break;
            Marshal.FreeHGlobal(buf);
            if (st != STATUS_INFO_LENGTH_MISMATCH) return -1;
            sz = rlen + 0x4000;
        }

        int released = 0;
        try {
            int count = Marshal.ReadInt32(buf, 0);

            for (int i = 0; i < count; i++) {
                int off = FIRST_ENTRY + i * ENTRY_SIZE;
                int pid    = (ushort)Marshal.ReadInt16(buf, off);
                ushort hdl = (ushort)Marshal.ReadInt16(buf, off + 6);

                Process proc;
                try   { proc = Process.GetProcessById(pid); }
                catch { continue; }
                if (!proc.ProcessName.Equals(procName, StringComparison.OrdinalIgnoreCase)) continue;

                IntPtr hProc = OpenProcess(PROCESS_DUP_HANDLE, false, pid);
                if (hProc == IntPtr.Zero) continue;

                // Duplicate the handle into our process so we can query its name
                IntPtr hDup;
                if (!DuplicateHandle(hProc, new IntPtr(hdl), GetCurrentProcess(), out hDup, 0, false, 0)) {
                    CloseHandle(hProc);
                    continue;
                }

                string name = GetName(hDup);
                CloseHandle(hDup);

                if (name != null && name.IndexOf(mutexFragment, StringComparison.OrdinalIgnoreCase) >= 0) {
                    // Close the handle IN the Roblox process (DUPLICATE_CLOSE_SOURCE)
                    IntPtr dummy;
                    DuplicateHandle(hProc, new IntPtr(hdl), IntPtr.Zero, out dummy, 0, false, DUPLICATE_CLOSE_SOURCE);
                    released++;
                }
                CloseHandle(hProc);
            }
        }
        finally { Marshal.FreeHGlobal(buf); }

        return released;
    }

    static string GetName(IntPtr h) {
        uint sz = 0x400;
        IntPtr buf = Marshal.AllocHGlobal((int)sz);
        try {
            uint rlen;
            if (NtQueryObject(h, ObjectNameInformation, buf, sz, out rlen) != 0) return null;
            // UNICODE_STRING: Length(2), MaxLength(2), [pad to IntPtr.Size], Buffer*(IntPtr)
            short slen = Marshal.ReadInt16(buf, 0);
            if (slen <= 0) return null;
            IntPtr sptr = Marshal.ReadIntPtr(buf, IntPtr.Size);
            return Marshal.PtrToStringUni(sptr, slen / 2);
        }
        catch { return null; }
        finally { Marshal.FreeHGlobal(buf); }
    }
}
"@ -Language CSharp -ErrorAction Stop

$n = [MutexCloser]::Release("RobloxPlayerBeta", "ROBLOX_singletonMutex")
Write-Output "released:$n"
