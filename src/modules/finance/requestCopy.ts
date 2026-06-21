// «Копировать заявку» — построение предзаполнения формы ЗРС из существующей
// заявки, чтобы быстро повторить регулярную (по образцу «Копировать» в ManaJet).
// Чистая логика — вынесено из Requests.jsx и покрыто Vitest (DoD: touch→
// extract→type→test).
//
// Пост (positionId) НЕ копируется с оригинала: заявка возвращается без id поста,
// да и копию подаёт сам пользователь от СВОЕГО поста — берём его первый пост.

export interface CopyableRequest {
  expense_type_id?: string | null;
  expense_type?: { id?: string | null } | null;
  fund?: { id?: string | null } | null;
  purpose?: string | null;
  planned_amount?: number | string | null;
  csw_data?: string | null;
  csw_situation?: string | null;
  csw_solution?: string | null;
  tags?: string[] | null;
}

export interface PositionLike {
  id: string;
}

// Состояние формы ЗРС (RequestForm) — строковые поля для контролируемых input.
export interface RequestPrefill {
  positionId: string;
  typeId: string;
  purpose: string;
  amount: string;
  fundId: string;
  cswData: string;
  cswSituation: string;
  cswSolution: string;
  tags: string;
}

export function requestPrefill(r: CopyableRequest, myPositions: PositionLike[]): RequestPrefill {
  return {
    positionId: myPositions[0]?.id || "",
    typeId: r.expense_type_id || r.expense_type?.id || "",
    purpose: r.purpose || "",
    amount: r.planned_amount != null && r.planned_amount !== "" ? String(r.planned_amount) : "",
    fundId: r.fund?.id || "",
    cswData: r.csw_data || "",
    cswSituation: r.csw_situation || "",
    cswSolution: r.csw_solution || "",
    tags: (r.tags || []).join(", "),
  };
}
