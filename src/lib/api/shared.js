// Разбивка списка id на пачки для .in(): один запрос с сотнями uuid упирается
// в лимит длины URL (PostgREST кодирует .in() в query string).
export const ID_CHUNK = 150;
export const chunkIds = (ids) => {
  const out = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) out.push(ids.slice(i, i + ID_CHUNK));
  return out;
};
