import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { ARCHIVE_BOOTSTRAP_LIMITS, evaluateArchiveBootstrap, extractArchiveEntries } from './archiveBootstrap';

describe('archiveBootstrap utilities', () => {
	it('evaluates safe mobile thresholds', () => {
		expect(evaluateArchiveBootstrap({
			remoteTrackedFileCount: ARCHIVE_BOOTSTRAP_LIMITS.maxFiles,
			remoteTrackedBlobBytes: ARCHIVE_BOOTSTRAP_LIMITS.maxTotalBytes,
			largestTrackedBlobBytes: ARCHIVE_BOOTSTRAP_LIMITS.maxSingleBlobBytes,
		})).toEqual(expect.objectContaining({ shouldUseArchive: true }));

		expect(evaluateArchiveBootstrap({
			remoteTrackedFileCount: ARCHIVE_BOOTSTRAP_LIMITS.maxFiles + 1,
			remoteTrackedBlobBytes: 1,
			largestTrackedBlobBytes: 1,
		}).fallbackReason).toBe('file-count-limit');
	});

	it('strips top-level zipball folder and filters protected paths', () => {
		const zip = zipSync({
			'repo-123/folder/note.md': strToU8('hello'),
			'repo-123/.obsidian/app.json': strToU8('{"theme":"dark"}'),
		});

		const entries = extractArchiveEntries(
			zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer,
			(path) => !path.startsWith('.obsidian/')
		);

		expect(entries.map(entry => entry.path)).toEqual(['folder/note.md']);
		expect(entries[0].content.toPlainText()).toBe('hello');
	});

	it('preserves binary entries as base64 content', () => {
		const zip = zipSync({
			'repo-123/image.png': new Uint8Array([0, 255, 10, 20]),
		});

		const entries = extractArchiveEntries(
			zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer,
			() => true
		);

		expect(entries).toHaveLength(1);
		expect(entries[0].content.toRaw().encoding).toBe('base64');
	});
});
