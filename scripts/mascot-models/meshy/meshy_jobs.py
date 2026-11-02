"""Catalog-named Meshy image-to-3D jobs with durable receipts and safe downloads.

The normal commands use meshy_pipeline.request(), which reads only the exact
Windows Credential Manager target NAVA/Meshy/api-key. Import and self-test do
not read credentials. The catalog creates one full worn-character job per
accessory. No combination, retry, deletion or generation-list API is exposed.
"""
import argparse
import base64
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import struct
import sys
import urllib.parse
import urllib.request
import uuid

sys.dont_write_bytecode = True
from meshy_pipeline import request

BUILD_ROOT = Path('Q:/NAVA-Workspace/Build')
ENDPOINT = '/openapi/v1/multi-image-to-3d'
CATALOG_PATH = Path(__file__).with_name('accessory-catalog-v1.json')
CATALOG = json.loads(CATALOG_PATH.read_text(encoding='utf-8'))
CATALOG_NAMES = tuple(item['slug'] for item in CATALOG['accessories'])
# Keep the two historical task folders readable for status/download recovery,
# and allow the canonical no-accessory cat in full-catalog reconstruction runs.
NAMES = tuple(dict.fromkeys((*CATALOG_NAMES, 'base', 'beret', 'scarf')))
EXPECTED_CREDITS = 40
FIXED_PARAMS = {
    'ai_model': 'latest', 'geometry_resolution': '2k',
    'texture_resolution': '8k', 'should_texture': True,
    'should_remesh': False, 'image_enhancement': False,
    'remove_lighting': True, 'enable_pbr': False,
    'target_formats': ['glb'], 'multi_view_thumbnails': True,
    'alpha_thumbnail': True, 'auto_size': False,
}
TASK_STATES = {'PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED',
               'CANCELED', 'CANCELLED', 'EXPIRED'}
TEXTURE_KEYS = ('base_color', 'metallic', 'roughness', 'normal', 'emission')
CDN_HOSTS = {'assets.meshy.ai', 'cdn.meshy.ai'}


class JobError(Exception):
    """Only a predefined, non-sensitive status code may reach stdout."""


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def atomic_json(path, value):
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            stream.write(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def exclusive_json(path, value):
    try:
        with path.open('x', encoding='utf-8') as stream:
            stream.write(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
    except FileExistsError:
        raise JobError('ALREADY_RESERVED_NO_RESUBMISSION') from None


def task_folder(root, name, create=False):
    if name not in NAMES:
        raise JobError('INVALID_JOB_NAME')
    root = Path(root).resolve()
    allowed = BUILD_ROOT.resolve()
    if root == allowed or not root.is_relative_to(allowed):
        raise JobError('ROOT_MUST_BE_INSIDE_NAVA_BUILD')
    folder = (root / name).resolve()
    if not folder.is_relative_to(root):
        raise JobError('INVALID_TASK_DIRECTORY')
    if any((parent / '.git').exists() for parent in (folder, *folder.parents)):
        raise JobError('TASK_DIRECTORY_MUST_BE_OUTSIDE_GIT')
    if create:
        folder.mkdir(parents=True, exist_ok=True)
    return folder


@contextmanager
def task_lock(folder):
    lock = folder / 'operation.lock'
    try:
        fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        raise JobError('TASK_LOCKED_MANUAL_INSPECTION_REQUIRED') from None
    try:
        os.write(fd, canonical({'pid': os.getpid(), 'at': now()}).encode('ascii'))
        os.fsync(fd)
        os.close(fd)
        fd = None
        yield
    finally:
        if fd is not None:
            os.close(fd)
        lock.unlink(missing_ok=True)


def number(value):
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and value >= 0)


def valid_id(value):
    return isinstance(value, str) and re.fullmatch(
        r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', value)


def safe_api(method, path, payload=None):
    try:
        return request(method, path, payload)
    except Exception:
        # Credential decoding errors and raw request exceptions also stay local.
        raise JobError('API_REQUEST_FAILED_DETAILS_WITHHELD') from None


def image_type(data):
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return ('image/png', '.png')
    if data.startswith(b'\xff\xd8\xff'):
        return ('image/jpeg', '.jpg')
    if len(data) >= 12 and data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return ('image/webp', '.webp')
    raise JobError('UNSUPPORTED_IMAGE_CONTENT')


def prepare_images(paths):
    if len(paths) != 4:
        raise JobError('EXACTLY_FOUR_LOCAL_IMAGES_REQUIRED')
    records, image_urls = [], []
    for supplied in paths:
        path = Path(supplied).resolve(strict=True)
        size = path.stat().st_size
        if not path.is_file() or not 0 < size <= 20 * 1024 * 1024:
            raise JobError('INPUT_IMAGE_SIZE_INVALID')
        data = path.read_bytes()
        if not 0 < len(data) <= 20 * 1024 * 1024:
            raise JobError('INPUT_IMAGE_SIZE_INVALID')
        mime, unused = image_type(data)
        records.append({'path': str(path), 'bytes': len(data), 'sha256': digest(data), 'mime': mime})
        image_urls.append('data:' + mime + ';base64,' + base64.b64encode(data).decode('ascii'))
    return records, image_urls


def load_journal(folder):
    try:
        journal = json.loads((folder / 'journal.json').read_text(encoding='utf-8'))
        if journal.get('version') != 1 or journal.get('name') != folder.name:
            raise ValueError()
        return journal
    except Exception:
        raise JobError('JOURNAL_MISSING_OR_INVALID') from None


def save_journal(folder, journal):
    journal['updated_at'] = now()
    atomic_json(folder / 'journal.json', journal)


def summary(folder, journal):
    task_id = journal.get('task_id')
    progress, credits = journal.get('progress'), journal.get('consumed_credits')
    return {'status': journal.get('status', 'UNKNOWN'),
            'progress': progress if number(progress) and progress <= 100 else None,
            'id': task_id if valid_id(task_id) else None,
            'consumed_credits': credits if number(credits) else None,
            'path': str(folder)}


def submit(root, name, paths):
    records, image_urls = prepare_images(paths)
    folder = task_folder(root, name, create=True)
    payload = dict(FIXED_PARAMS, image_urls=image_urls, texture_image_urls=image_urls)
    params_record = dict(FIXED_PARAMS, texture_input='same_four_input_images')
    journal = {
        'version': 1, 'name': name, 'created_at': now(), 'updated_at': now(),
        'status': 'PREPARED', 'endpoint': ENDPOINT, 'task_id': None,
        'expected_credits': EXPECTED_CREDITS, 'images': records,
        'parameters': params_record, 'parameters_sha256': digest(canonical(params_record).encode('utf-8')),
        'input_fingerprint': digest(canonical([row['sha256'] for row in records]).encode('ascii')),
        'post_attempts': 0,
    }
    with task_lock(folder):
        # Even failed/ambiguous attempts retain this reservation. Never replace it.
        if (folder / 'submission-receipt.json').exists():
            raise JobError('ALREADY_RESERVED_NO_RESUBMISSION')
        exclusive_json(folder / 'journal.json', journal)
        try:
            before = safe_api('GET', '/openapi/v1/balance')
            balance = before.get('balance') if isinstance(before, dict) else None
            if not number(balance):
                raise JobError('INVALID_BALANCE_RESPONSE')
            journal['balance_before'] = balance
            if balance < EXPECTED_CREDITS:
                raise JobError('INSUFFICIENT_CREDITS_NO_SUBMISSION')
        except BaseException:
            journal['status'] = 'PREFLIGHT_FAILED_NO_SUBMISSION'
            save_journal(folder, journal)
            raise JobError('PREFLIGHT_FAILED_NO_SUBMISSION') from None
        # Durable marker precedes the only POST. No network retry is performed.
        journal['status'] = 'SUBMITTING'
        journal['post_attempts'] = 1
        journal['submitting_at'] = now()
        save_journal(folder, journal)
        try:
            result = safe_api('POST', ENDPOINT, payload)
            task_id = result.get('result') if isinstance(result, dict) else None
            if not valid_id(task_id):
                raise JobError('INVALID_TASK_RECEIPT')
            # Preserve the ID independently first, in case the journal update fails.
            exclusive_json(folder / 'submission-receipt.json', {'task_id': task_id, 'received_at': now()})
            journal['task_id'] = task_id
            journal['status'] = 'SUBMITTED'
            save_journal(folder, journal)
        except BaseException:
            journal['status'] = 'SUBMISSION_UNKNOWN_NO_RESUBMISSION'
            try:
                save_journal(folder, journal)
            except Exception:
                pass
            raise JobError('SUBMISSION_UNKNOWN_NO_RESUBMISSION') from None
    return summary(folder, journal)


def choose_task_id(folder, journal, supplied=None):
    stored = journal.get('task_id')
    receipt = folder / 'submission-receipt.json'
    if not stored and receipt.exists():
        stored = json.loads(receipt.read_text(encoding='utf-8')).get('task_id')
    if supplied and stored and supplied.lower() != stored.lower():
        raise JobError('TASK_ID_CONFLICT')
    task_id = supplied or stored
    if task_id is not None and not valid_id(task_id):
        raise JobError('INVALID_TASK_ID')
    return task_id


def refresh(folder, journal, task_id):
    raw = safe_api('GET', ENDPOINT + '/' + task_id)
    if not isinstance(raw, dict) or raw.get('id', '').lower() != task_id.lower():
        raise JobError('TASK_RESPONSE_ID_MISMATCH')
    if raw.get('status') not in TASK_STATES:
        raise JobError('TASK_RESPONSE_STATUS_INVALID')
    # Signed URLs are retained here only, under non-Git Build output; never printed.
    atomic_json(folder / 'task-result.json', raw)
    journal.update(task_id=task_id, status=raw['status'], progress=raw.get('progress'),
                   consumed_credits=raw.get('consumed_credits'), polled_at=now())
    save_journal(folder, journal)
    return raw


def status(root, name, supplied=None):
    folder = task_folder(root, name)
    with task_lock(folder):
        journal = load_journal(folder)
        task_id = choose_task_id(folder, journal, supplied)
        if task_id:
            refresh(folder, journal, task_id)
        return summary(folder, journal)


class NoCdnRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def download_file(url, target, max_bytes):
    parsed = urllib.parse.urlsplit(url) if isinstance(url, str) else None
    if (not parsed or parsed.scheme != 'https' or parsed.hostname not in CDN_HOSTS
            or parsed.username or parsed.password or parsed.port not in (None, 443)):
        raise JobError('ASSET_URL_REJECTED')
    # Completely separate from the API client: no credential read, cookie jar,
    # Authorization header or redirected request, even to another Meshy host.
    req = urllib.request.Request(url, headers={'Accept': '*/*'}, method='GET')
    opener = urllib.request.build_opener(NoCdnRedirect())
    temporary = target.with_name(target.name + '.part')
    try:
        with opener.open(req, timeout=60) as response, temporary.open('wb') as stream:
            if response.status != 200:
                raise JobError('ASSET_DOWNLOAD_HTTP_FAILURE')
            count = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                count += len(chunk)
                if count > max_bytes:
                    raise JobError('ASSET_DOWNLOAD_SIZE_LIMIT')
                stream.write(chunk)
            if not count:
                raise JobError('EMPTY_ASSET_DOWNLOAD')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
    except JobError:
        raise
    except Exception:
        raise JobError('ASSET_DOWNLOAD_FAILED_DETAILS_WITHHELD') from None
    finally:
        temporary.unlink(missing_ok=True)


def glb_self_contained(path):
    size = path.stat().st_size
    with path.open('rb') as stream:
        header = stream.read(12)
        if len(header) != 12 or struct.unpack('<4sII', header) != (b'glTF', 2, size):
            raise JobError('INVALID_GLB_HEADER')
        chunk = stream.read(8)
        if len(chunk) != 8:
            raise JobError('INVALID_GLB_JSON')
        length, kind = struct.unpack('<II', chunk)
        if kind != 0x4E4F534A or length > min(size - 20, 64 * 1024 * 1024):
            raise JobError('INVALID_GLB_JSON')
        data = json.loads(stream.read(length))
    for entry in data.get('buffers', []) + data.get('images', []):
        uri = entry.get('uri')
        if uri and not uri.startswith('data:'):
            raise JobError('GLB_HAS_EXTERNAL_DEPENDENCIES')
    return True


def file_record(path, folder):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return {'path': str(path.relative_to(folder)), 'bytes': path.stat().st_size, 'sha256': h.hexdigest()}


def download(root, name, supplied=None):
    folder = task_folder(root, name)
    with task_lock(folder):
        journal = load_journal(folder)
        task_id = choose_task_id(folder, journal, supplied)
        if not task_id:
            raise JobError('NO_TASK_ID_NO_DOWNLOAD')
        raw = refresh(folder, journal, task_id)
        if raw['status'] != 'SUCCEEDED':
            return summary(folder, journal)
        destination = folder / 'assets'
        destination.mkdir(exist_ok=True)
        model_url = raw.get('model_urls', {}).get('glb')
        model = destination / 'model.glb'
        download_file(model_url, model, 1024 * 1024 * 1024)
        glb_self_contained(model)
        manifest = {'task_id': task_id, 'glb_self_contained': True,
                    'downloaded_at': now(), 'files': [file_record(model, folder)]}
        textures = raw.get('texture_urls') or []
        if not isinstance(textures, list):
            raise JobError('INVALID_TEXTURE_LIST')
        for index, texture_set in enumerate(textures):
            if not isinstance(texture_set, dict):
                raise JobError('INVALID_TEXTURE_SET')
            for key in TEXTURE_KEYS:
                url = texture_set.get(key)
                if not url:
                    continue
                temporary = destination / ('texture-%02d-%s.download' % (index, key))
                download_file(url, temporary, 128 * 1024 * 1024)
                with temporary.open('rb') as stream:
                    unused, suffix = image_type(stream.read(16))
                image = temporary.with_suffix(suffix)
                os.replace(temporary, image)
                manifest['files'].append(file_record(image, folder))
        atomic_json(folder / 'download-manifest.json', manifest)
        journal['downloaded_at'] = now()
        journal['download_manifest'] = 'download-manifest.json'
        save_journal(folder, journal)
        result = summary(folder, journal)
        result['path'] = str(destination)
        return result


def self_test(root):
    """Offline fixtures replace both transport paths before invoking any command."""
    from unittest.mock import patch
    fixture = task_folder(root, 'beret', create=True).parent / ('offline-fixture-' + uuid.uuid4().hex)
    fixture.mkdir()
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=')
    images = []
    for index in range(4):
        path = fixture / ('view-%d.png' % index)
        path.write_bytes(png)
        images.append(str(path))
    task_id = '018a210d-8ba4-705c-b111-1f1776f7f578'
    fake_url = 'https://assets.meshy.ai/offline/model.glb?signature=FIXTURE-NOT-A-SECRET'
    raw = {'id': task_id, 'status': 'SUCCEEDED', 'progress': 100, 'consumed_credits': 40,
           'model_urls': {'glb': fake_url}, 'texture_urls': [{'base_color': fake_url.replace('model.glb', 'base.png')}]}
    document = canonical({'asset': {'version': '2.0'}, 'buffers': [{'byteLength': len(png)}],
                          'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(png)}],
                          'images': [{'bufferView': 0, 'mimeType': 'image/png'}]}).encode('utf-8')
    document += b' ' * (-len(document) % 4)
    binary = png + b'\0' * (-len(png) % 4)
    glb = (struct.pack('<4sII', b'glTF', 2, 28 + len(document) + len(binary))
           + struct.pack('<II', len(document), 0x4E4F534A) + document
           + struct.pack('<II', len(binary), 0x004E4942) + binary)
    calls, cdn_calls, assertions = [], [], []

    def fake_api(method, path, payload=None):
        calls.append((method, path))
        if path == '/openapi/v1/balance':
            return {'balance': 3060}
        if method == 'POST':
            assert path == ENDPOINT
            assert all(payload[k] == v for k, v in FIXED_PARAMS.items())
            assert len(payload['image_urls']) == 4
            assert payload['texture_image_urls'] == payload['image_urls']
            record = json.loads((fixture / 'success' / 'beret' / 'journal.json').read_text())
            assert record['status'] == 'SUBMITTING' and record['post_attempts'] == 1
            return {'result': task_id}
        return raw

    class FakeResponse(io.BytesIO):
        status = 200

    class FakeOpener:
        def open(self, req, timeout):
            assert not any(k.lower() in ('authorization', 'cookie') for k, v in req.header_items())
            cdn_calls.append(req.get_method())
            return FakeResponse(glb if urllib.parse.urlsplit(req.full_url).path.endswith('.glb') else png)

    def fake_opener(*handlers):
        assert len(handlers) == 1 and isinstance(handlers[0], NoCdnRedirect)
        return FakeOpener()

    with patch(__name__ + '.request', side_effect=fake_api), patch('urllib.request.build_opener', side_effect=fake_opener), patch('meshy_pipeline.credential', side_effect=AssertionError('Credential access forbidden in self-test')):
        submitted = submit(fixture / 'success', 'beret', images)
        assert submitted['id'] == task_id
        assertions.append('durable_submitting_before_single_post')
        before_calls = len(calls)
        try:
            submit(fixture / 'success', 'beret', images)
            raise AssertionError('Duplicate submission accepted')
        except JobError as err:
            assert str(err) == 'ALREADY_RESERVED_NO_RESUBMISSION'
        assert len(calls) == before_calls
        assertions.append('duplicate_blocked_without_api_call')
        polled = status(fixture / 'success', 'beret')
        assert polled['consumed_credits'] == 40 and polled['progress'] == 100
        downloaded = download(fixture / 'success', 'beret')
        manifest = json.loads((fixture / 'success' / 'beret' / 'download-manifest.json').read_text())
        assert manifest['glb_self_contained'] and len(manifest['files']) == 2 and len(cdn_calls) == 2
        assert 'signature' not in canonical(downloaded) and 'signature' not in canonical(manifest)
        assert 'image_urls' not in (fixture / 'success' / 'beret' / 'journal.json').read_text()
        assertions.extend(['status_uses_get', 'glb_and_texture_downloaded', 'cdn_has_no_bearer_or_redirect', 'summaries_have_no_signed_url'])
        failed_calls = []

        def ambiguous_api(method, path, payload=None):
            failed_calls.append(method)
            if method == 'GET':
                return {'balance': 3060}
            raise TimeoutError('FAKE sensitive body must not be printed')

        with patch(__name__ + '.request', side_effect=ambiguous_api):
            for attempt in range(2):
                try:
                    submit(fixture / 'ambiguous', 'scarf', images)
                    raise AssertionError('Ambiguous submission unexpectedly succeeded')
                except JobError as err:
                    assert str(err) in ('SUBMISSION_UNKNOWN_NO_RESUBMISSION', 'ALREADY_RESERVED_NO_RESUBMISSION')
            assert failed_calls.count('POST') == 1
            local = status(fixture / 'ambiguous', 'scarf')
            assert local['status'] == 'SUBMISSION_UNKNOWN_NO_RESUBMISSION' and local['id'] is None
        assertions.append('ambiguous_submission_never_retried')
        # Explicit operator recovery is GET-only, and an ID receipt also repairs
        # a journal interrupted between the receipt and journal writes.
        recovered = status(fixture / 'ambiguous', 'scarf', task_id)
        assert recovered['id'] == task_id and recovered['status'] == 'SUCCEEDED'
        assertions.append('explicit_id_recovery_is_get_only')
        interrupted = load_journal(fixture / 'success' / 'beret')
        interrupted.update(task_id=None, status='SUBMITTING')
        save_journal(fixture / 'success' / 'beret', interrupted)
        recovered = status(fixture / 'success', 'beret')
        assert recovered['id'] == task_id and recovered['status'] == 'SUCCEEDED'
        assertions.append('durable_receipt_recovers_interrupted_journal')
        with patch(__name__ + '.request', return_value={'balance': 0}) as insufficient:
            try:
                submit(fixture / 'insufficient', 'beret', images)
                raise AssertionError('Insufficient balance accepted')
            except JobError as err:
                assert str(err) == 'PREFLIGHT_FAILED_NO_SUBMISSION'
            assert insufficient.call_count == 1 and insufficient.call_args.args[0] == 'GET'
        assertions.append('insufficient_balance_prevents_post')
        try:
            download_file('https://example.com/not-meshy', fixture / 'forbidden', 100)
            raise AssertionError('Untrusted CDN accepted')
        except JobError as err:
            assert str(err) == 'ASSET_URL_REJECTED'
        assertions.append('untrusted_download_host_blocked')
        external_json = canonical({'asset': {'version': '2.0'}, 'images': [{'uri': 'https://example.com/external.png'}]}).encode('utf-8')
        external_json += b' ' * (-len(external_json) % 4)
        external = fixture / 'external-reference-fixture.glb'
        external.write_bytes(struct.pack('<4sII', b'glTF', 2, 20 + len(external_json))
                             + struct.pack('<II', len(external_json), 0x4E4F534A) + external_json)
        try:
            glb_self_contained(external)
            raise AssertionError('External GLB dependency accepted')
        except JobError as err:
            assert str(err) == 'GLB_HAS_EXTERNAL_DEPENDENCIES'
        assertions.append('glb_external_dependencies_rejected')
    atomic_json(fixture / 'self-test-report.json', {'passed': True, 'network_calls': 0,
                'credential_reads': 0, 'assertions': assertions, 'at': now()})
    return {'status': 'OFFLINE_SELF_TEST_PASSED', 'progress': None, 'id': None,
            'consumed_credits': 0, 'path': str(fixture / 'self-test-report.json')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='action', required=True)
    for action in ('submit', 'status', 'download'):
        command = commands.add_parser(action)
        command.add_argument('--name', choices=NAMES, required=True)
        command.add_argument('--root', required=True, help='One shared batch directory beneath Q:/NAVA-Workspace/Build; keep it for both named jobs')
        if action == 'submit':
            command.add_argument('--images', nargs=4, required=True, metavar=('FRONT', 'LEFT', 'BACK', 'RIGHT'))
        else:
            command.add_argument('--task-id', help='Optional explicit recovery ID; never creates or retries a job')
    test = commands.add_parser('self-test', help='Local fixtures only: no credential read or network request')
    test.add_argument('--root', required=True)
    args = parser.parse_args()
    if args.action == 'submit':
        result = submit(args.root, args.name, args.images)
    elif args.action == 'status':
        result = status(args.root, args.name, args.task_id)
    elif args.action == 'download':
        result = download(args.root, args.name, args.task_id)
    else:
        result = self_test(args.root)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except JobError as error:
        print(json.dumps({'status': str(error)}))
        sys.exit(2)
    except KeyboardInterrupt:
        print(json.dumps({'status': 'INTERRUPTED_INSPECT_JOURNAL_NO_AUTOMATIC_RETRY'}))
        sys.exit(130)
    except Exception:
        print(json.dumps({'status': 'LOCAL_OPERATION_FAILED_DETAILS_WITHHELD'}))
        sys.exit(3)
