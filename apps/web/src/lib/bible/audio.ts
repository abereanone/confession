import { BOOKS_BY_CODE } from "./books";

// openbible.com hosts the Berean Standard Bible (BSB) chapter audio used here.
// The file naming scheme matches biblepod.app's RSS generator:
//   https://openbible.com/audio/{speaker}/BSB_{ord}_{Code}_{NNN}{speakerSuffix}.mp3
// where {ord} is the 2-digit book order, {Code} is openbible's 3-char book code
// and {NNN} is the zero-padded chapter number.
// See https://gitlab.com/svrbc/biblepod.app/-/blob/master/server/utils/rss.ts#L135

// openbible book codes in canonical 66-book order. A few differ from this
// project's internal codes (e.g. Nahum "Nam" vs "nah", Titus "Tts" vs "tit").
const OPENBIBLE_BOOK_CODES = [
  "Gen", "Exo", "Lev", "Num", "Deu", "Jos", "Jdg", "Rut", "1Sa", "2Sa",
  "1Ki", "2Ki", "1Ch", "2Ch", "Ezr", "Neh", "Est", "Job", "Psa", "Pro",
  "Ecc", "Sng", "Isa", "Jer", "Lam", "Ezk", "Dan", "Hos", "Jol", "Amo",
  "Oba", "Jon", "Mic", "Nam", "Hab", "Zep", "Hag", "Zec", "Mal", "Mat",
  "Mrk", "Luk", "Jhn", "Act", "Rom", "1Co", "2Co", "Gal", "Eph", "Php",
  "Col", "1Th", "2Th", "1Ti", "2Ti", "Tts", "Phm", "Heb", "Jas", "1Pe",
  "2Pe", "1Jn", "2Jn", "3Jn", "Jud", "Rev",
] as const;

export const CHAPTER_AUDIO_READER = "Steve Hays";

/**
 * Build the public MP3 URL for a chapter's narrated audio, or null when the
 * book code is unknown.
 */
export function getChapterAudioUrl(bookCode: string, chapter: number): string | null {
  const book = BOOKS_BY_CODE.get(String(bookCode ?? "").trim().toLowerCase());
  if (!book || !Number.isFinite(chapter) || chapter < 1) {
    return null;
  }

  const openBibleCode = OPENBIBLE_BOOK_CODES[book.order];
  if (!openBibleCode) {
    return null;
  }

  const ord = String(book.order + 1).padStart(2, "0");
  const chapterPart = String(chapter).padStart(3, "0");
  return `https://openbible.com/audio/hays/BSB_${ord}_${openBibleCode}_${chapterPart}_H.mp3`;
}
