import { listRecords } from '@/lib/storage';

type StoredComfyJob = {
  owner?: string;
  promptId?: string;
  outputs?: Array<{ filename?: string; subfolder?: string; type?: string }>;
};

export async function findOwnedComfyJob(userId: string, promptId: string): Promise<StoredComfyJob | null> {
  const jobs = await listRecords<StoredComfyJob & { id?: string }>('jobs', 500);
  return jobs.find((job) => job.owner === userId && job.promptId === promptId) ?? null;
}

export async function ownsComfyOutput(
  userId: string,
  file: { filename: string; subfolder: string; type: string },
): Promise<boolean> {
  const jobs = await listRecords<StoredComfyJob>('jobs', 500);
  return jobs.some((job) =>
    job.owner === userId &&
    Array.isArray(job.outputs) &&
    job.outputs.some((output) =>
      output.filename === file.filename &&
      (output.subfolder || '') === file.subfolder &&
      (output.type || 'output') === file.type
    )
  );
}
