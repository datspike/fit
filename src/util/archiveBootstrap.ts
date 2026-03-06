import { unzipSync } from 'fflate';
import { FileStates } from './changeTracking';
import { CommitSha } from './hashing';
import { decodeFileContent } from './obsidianHelpers';
import { FileContent } from './contentEncoding';

export const ARCHIVE_BOOTSTRAP_LIMITS = {
	maxFiles: 2500,
	maxTotalBytes: 80 * 1024 * 1024,
	maxSingleBlobBytes: 20 * 1024 * 1024,
	writeBatchSize: 100,
} as const;

export type ArchiveBootstrapFallbackReason =
	| 'file-count-limit'
	| 'total-bytes-limit'
	| 'single-blob-limit'
	| 'archive-download-unavailable';

export type ArchiveBootstrapPhase = 'download' | 'extract' | 'write';

export type ArchiveBootstrapCheckpoint = {
	targetCommitSha: CommitSha;
	phase: ArchiveBootstrapPhase;
	completedPaths: string[];
	writtenLocalSha: FileStates;
	fallbackReason?: ArchiveBootstrapFallbackReason;
	updatedAt: string;
};

export type ArchiveBootstrapTreeMetrics = {
	remoteTrackedFileCount: number;
	remoteTrackedBlobBytes: number;
	largestTrackedBlobBytes: number;
};

export type ArchiveBootstrapDecision = {
	shouldUseArchive: boolean;
	fallbackReason?: ArchiveBootstrapFallbackReason;
	metrics: ArchiveBootstrapTreeMetrics;
};

export type ArchiveEntry = {
	path: string;
	content: FileContent;
};

export function evaluateArchiveBootstrap(
	metrics: ArchiveBootstrapTreeMetrics
): ArchiveBootstrapDecision {
	if (metrics.remoteTrackedFileCount > ARCHIVE_BOOTSTRAP_LIMITS.maxFiles) {
		return { shouldUseArchive: false, fallbackReason: 'file-count-limit', metrics };
	}
	if (metrics.remoteTrackedBlobBytes > ARCHIVE_BOOTSTRAP_LIMITS.maxTotalBytes) {
		return { shouldUseArchive: false, fallbackReason: 'total-bytes-limit', metrics };
	}
	if (metrics.largestTrackedBlobBytes > ARCHIVE_BOOTSTRAP_LIMITS.maxSingleBlobBytes) {
		return { shouldUseArchive: false, fallbackReason: 'single-blob-limit', metrics };
	}
	return { shouldUseArchive: true, metrics };
}

export function extractArchiveEntries(
	zipBuffer: ArrayBuffer,
	shouldIncludePath: (path: string) => boolean
): ArchiveEntry[] {
	const archiveEntries = unzipSync(new Uint8Array(zipBuffer));
	const extracted: ArchiveEntry[] = [];

	for (const [rawPath, bytes] of Object.entries(archiveEntries)) {
		if (rawPath.endsWith('/')) {
			continue;
		}

		const strippedPath = stripZipballRoot(rawPath);
		if (!strippedPath || !shouldIncludePath(strippedPath)) {
			continue;
		}

		const view = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
			? bytes.buffer.slice(0)
			: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
		extracted.push({
			path: strippedPath,
			content: decodeFileContent(view as ArrayBuffer)
		});
	}

	return extracted.sort((left, right) => left.path.localeCompare(right.path));
}

function stripZipballRoot(rawPath: string): string {
	const firstSlash = rawPath.indexOf('/');
	if (firstSlash === -1 || firstSlash === rawPath.length - 1) {
		return '';
	}
	return rawPath.slice(firstSlash + 1);
}
