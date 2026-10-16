"""Local Meshy client. Reads only NAVA/Meshy/api-key; never logs credentials."""
import argparse
import ctypes
from ctypes import wintypes
import json
import sys
import urllib.error
import urllib.request

TARGET = 'NAVA/Meshy/api-key'
API = 'https://api.meshy.ai'

class SafeError(Exception):
    pass

class CREDENTIALW(ctypes.Structure):
    _fields_ = [('Flags', wintypes.DWORD), ('Type', wintypes.DWORD),
                ('TargetName', wintypes.LPWSTR), ('Comment', wintypes.LPWSTR),
                ('LastWritten', wintypes.FILETIME), ('CredentialBlobSize', wintypes.DWORD),
                ('CredentialBlob', ctypes.POINTER(ctypes.c_ubyte)),
                ('Persist', wintypes.DWORD), ('AttributeCount', wintypes.DWORD),
                ('Attributes', ctypes.c_void_p), ('TargetAlias', wintypes.LPWSTR),
                ('UserName', wintypes.LPWSTR)]

def credential():
    advapi = ctypes.WinDLL('Advapi32.dll', use_last_error=True)
    read = advapi.CredReadW
    read.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                     ctypes.POINTER(ctypes.POINTER(CREDENTIALW))]
    read.restype = wintypes.BOOL
    free = advapi.CredFree
    free.argtypes = [ctypes.c_void_p]
    free.restype = None
    ptr = ctypes.POINTER(CREDENTIALW)()
    if not read(TARGET, 1, 0, ctypes.byref(ptr)):
        raise SafeError('Credential unavailable; Windows error %d' % ctypes.get_last_error())
    try:
        blob = ctypes.string_at(ptr.contents.CredentialBlob, ptr.contents.CredentialBlobSize)
        key = blob.decode('utf-16-le').rstrip('\x00').strip()
        if len(key) < 16 or any(c.isspace() for c in key):
            raise SafeError('Stored credential format invalid')
        return key
    finally:
        if ptr.contents.CredentialBlobSize:
            ctypes.memset(ptr.contents.CredentialBlob, 0, ptr.contents.CredentialBlobSize)
        free(ptr)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def request(method, path, payload=None):
    if not path.startswith('/openapi/') or '://' in path or '..' in path:
        raise SafeError('Invalid API path')
    key = credential()
    req = urllib.request.Request(API + path,
        data=None if payload is None else json.dumps(payload).encode('utf-8'),
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
        method=method)
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=55) as response:
            return json.load(response)
    except urllib.error.HTTPError as err:
        raise SafeError('Meshy returned HTTP %d; response body withheld' % err.code) from None
    except Exception:
        raise SafeError('Meshy request did not complete; raw error withheld') from None
    finally:
        req.remove_header('Authorization')
        key = None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['balance'])
    args = parser.parse_args()
    if args.action == 'balance':
        result = request('GET', '/openapi/v1/balance')
        balance = result.get('balance')
        if not isinstance(balance, (int, float)):
            raise SafeError('Unexpected balance format; body withheld')
        print(json.dumps({'connection': 'verified', 'credits': balance,
                          'credential_source': 'Windows Credential Manager',
                          'generation_submitted': False}))

if __name__ == '__main__':
    try:
        main()
    except SafeError as err:
        print(str(err), file=sys.stderr)
        sys.exit(2)
    except Exception:
        print('Local operation failed; sensitive error details withheld', file=sys.stderr)
        sys.exit(3)
