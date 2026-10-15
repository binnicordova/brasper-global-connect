import { endpoints } from "./config";
import { ApiError } from "./errors";
import { getSession } from "./session";

export const MAX_PROOF_BYTES = 8 * 1024 * 1024;

/** Mirrors storage.rules: an image or a PDF, strictly under 8 MB. */
export function checkProofFile(file: Pick<File, "type" | "size">): ApiError | null {
  if (!(file.type.startsWith("image/") || file.type === "application/pdf"))
    return new ApiError("invalid-proof-file");
  if (file.size <= 0) return new ApiError("invalid-proof-file");
  if (file.size >= MAX_PROOF_BYTES) return new ApiError("proof-too-large");
  return null;
}

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** `proofs/<uid>/<orderId>/<file>`: the only place the rules let the owner write. */
export function proofPathFor(uid: string, orderId: string, file: Pick<File, "type">): string {
  const ext = EXTENSIONS[file.type] ?? "bin";
  return `proofs/${uid}/${orderId}/proof-${Date.now()}.${ext}`;
}

/** Uploads the payment proof to Firebase Storage and returns the path to hand to `submitProof`. */
export async function uploadProof(orderId: string, file: File): Promise<string> {
  const invalid = checkProofFile(file);
  if (invalid) throw invalid;
  const session = await getSession();
  const path = proofPathFor(session.uid, orderId, file);
  let response: Response;
  try {
    response = await fetch(endpoints.storageUpload(path), {
      method: "POST",
      headers: { authorization: `Firebase ${session.idToken}`, "content-type": file.type },
      body: file,
    });
  } catch {
    throw new ApiError("network");
  }
  if (!response.ok) throw new ApiError(response.status >= 500 ? "network" : "invalid-proof-path");
  return path;
}
