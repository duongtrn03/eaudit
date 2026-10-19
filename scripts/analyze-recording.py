"""Generate a reproducible inventory from all nine recording metadata files and DOM states."""
import argparse
import collections
import hashlib
import json
import pathlib
import re

APP = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--recording-root', type=pathlib.Path, default=APP, help='Directory containing recording JSON files and routes/')
ROOT = parser.parse_args().recording_root.resolve()

names = ['events', 'manifest', 'network', 'routes', 'snapshots', 'snapshot-diffs', 'snapshotMetrics', 'timeline', 'visits']
data = {name: json.loads((ROOT / (name + '.json')).read_text()) for name in names}
report = {
    'inputs': {name + '.json': {'sha256': hashlib.sha256((ROOT / (name + '.json')).read_bytes()).hexdigest(),
                              'records': len(value) if isinstance(value, list) else None} for name, value in data.items()},
    'recordingLimited': data['manifest']['session']['limited'],
    'eventTypes': dict(collections.Counter(event['type'] for event in data['events'])),
    'eventSelectors': dict(collections.Counter(event['selector'] for event in data['events'])),
    'apiRequests': dict(collections.Counter(request['method'] + ' ' + request['endpoint'].split('/api/')[1] for request in data['network'])),
    'capturePhases': dict(collections.Counter(state.get('capturePhase') for state in data['snapshots'])),
    'limitedMetricRecords': sum(bool(metric['limited']) for metric in data['snapshotMetrics']),
    'timelineKinds': dict(collections.Counter(entry['kind'] for entry in data['timeline'])),
    'visits': sorted(data['visits'], key=lambda visit: visit['sequence']),
    'routes': [{key: route.get(key) for key in ['pathname', 'snapshotStatus']} for route in data['routes']],
    'largeDiffs': sorted(data['snapshot-diffs'], key=lambda diff: diff['addedCharacters'] + diff['removedCharacters'], reverse=True)[:10],
    'questionTransitions': [], 'questions': {},
}
previous = None
for state in sorted(data['snapshots'], key=lambda state: state['timestamp']):
    html = (ROOT / state['htmlFile']).read_text()
    match = re.search(r'rounded-full text-sm font-bold">(\d+)', html)
    content = re.search(r'<div class="question-content[^\"]*">(.*?)</div>', html, re.S)
    if not match or not content:
        continue
    question = match[1]
    selected = re.search(r'<option value="([^\"]+)" selected', html)
    report['questions'].setdefault(question, {'source': state['htmlFile'], 'contentSha256': hashlib.sha256(content[1].encode()).hexdigest()})
    if question != previous:
        report['questionTransitions'].append({'timestamp': state['timestamp'], 'question': int(question), 'language': selected[1] if selected else None})
        previous = question
report['lastDomCapture'] = max(state['timestamp'] for state in data['snapshots'])
(APP / 'recording-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print('Analyzed all nine metadata files and all', len(data['snapshots']), 'DOM snapshots.')
