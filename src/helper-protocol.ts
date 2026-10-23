export interface DictionaryEntry {
  identifier: string;
  dictionary: string;
  definition: string;
}

export interface DictionarySuggestion {
  term: string;
  snippet: string;
}

/**
 * The Swift helper prints this token on stderr when no dictionaries are
 * enabled in Dictionary.app. The JavaScript side maps it to a friendlier
 * message than "no definition found".
 */
export const NO_DICTIONARIES_MARKER = "no-active-dictionaries";

const INVALID_RESPONSE = "The macOS Dictionary returned an invalid response.";

export class DictionaryLookupError extends Error {
  /** Set when rebuilding the helper binary may fix the failure. */
  readonly rebuildHelper: boolean;

  constructor(message: string, options?: { cause?: unknown; rebuildHelper?: boolean }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "DictionaryLookupError";
    this.rebuildHelper = options?.rebuildHelper ?? false;
  }
}

interface ChildProcessFailure {
  code?: string | number;
  killed?: boolean;
  message?: string;
  stderr?: string | Buffer;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function firstStderrLine(failure: ChildProcessFailure): string {
  const stderr = failure.stderr;
  if (typeof stderr !== "string") return "";
  return (
    stderr
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)[0] ?? ""
  );
}

/** Maps a raw execFile failure onto a user-presentable DictionaryLookupError. */
export function helperFailure(error: unknown): DictionaryLookupError {
  const failure: ChildProcessFailure = isObject(error) ? (error as ChildProcessFailure) : {};
  const detail = firstStderrLine(failure);

  if (failure.killed) {
    return new DictionaryLookupError(
      "The macOS Dictionary lookup timed out. Please try again.",
      { cause: error },
    );
  }

  if (/maxBuffer/i.test(String(failure.message ?? ""))) {
    return new DictionaryLookupError(
      "The macOS Dictionary returned more data than expected. Try a more specific word.",
      { cause: error },
    );
  }

  if (
    failure.code === "ENOENT" ||
    failure.code === "EACCES" ||
    failure.code === "ETXTBSY"
  ) {
    const reason =
      failure.code === "ENOENT"
        ? "The compiled Dictionary helper is missing."
        : failure.code === "EACCES"
          ? "The compiled Dictionary helper is not executable."
          : "The compiled Dictionary helper could not be started.";
    return new DictionaryLookupError(`${reason} It will be rebuilt automatically.`, {
      cause: error,
      rebuildHelper: true,
    });
  }

  if (typeof failure.code === "number") {
    return new DictionaryLookupError(
      detail
        ? `The macOS Dictionary helper failed: ${detail}`
        : `The macOS Dictionary helper exited unexpectedly (code ${failure.code}).`,
      { cause: error },
    );
  }

  return new DictionaryLookupError("The macOS Dictionary lookup failed. Please try again.", {
    cause: error,
  });
}

export function parseHelperPayload<T>(stdout: string, validate: (value: unknown) => T): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new DictionaryLookupError(INVALID_RESPONSE, { cause: error });
  }
  return validate(parsed);
}

export function isDictionaryEntry(value: unknown): value is DictionaryEntry {
  return (
    isObject(value) &&
    typeof value.identifier === "string" &&
    typeof value.dictionary === "string" &&
    typeof value.definition === "string"
  );
}

export function validateEntries(value: unknown): DictionaryEntry[] {
  if (!Array.isArray(value)) throw new DictionaryLookupError(INVALID_RESPONSE);
  return value.filter(isDictionaryEntry);
}

function isDictionarySuggestion(value: unknown): value is DictionarySuggestion {
  return (
    isObject(value) &&
    typeof value.term === "string" &&
    value.term.length > 0 &&
    typeof value.snippet === "string"
  );
}

export function validateSuggestions(value: unknown): DictionarySuggestion[] {
  if (!Array.isArray(value)) throw new DictionaryLookupError(INVALID_RESPONSE);
  return value.filter(isDictionarySuggestion);
}
