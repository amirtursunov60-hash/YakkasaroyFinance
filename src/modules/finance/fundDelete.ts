import { fmt } from "../../utils/format";

// Чистая логика «удаления» фонда = слияние + архив (docs/funds-spec.md).
// Реестр неизменяем: историю не двигаем, фонд после переноса остатка
// архивируется (его запись остаётся ради целостности леджера).
//
// Фаза 1 — только денежный остаток. Фонд с незакрытыми займами или с
// одобренными неоплаченными обязательствами удалять нельзя: сначала их закрыть.

export interface FundDeleteInput {
  balance: number;       // текущий остаток фонда (≥ 0, БД не даёт минуса)
  debt: number;          // сальдо займов: ≠ 0 — есть незакрытые займы
  commitments: number;   // одобренные неоплаченные заявки/счета (обязательства)
}

export interface FundDeletePlan {
  deletable: boolean;       // можно ли удалить прямо сейчас
  needsTransfer: boolean;   // нужен фонд-приёмник для переноса остатка
  blockers: string[];       // причины запрета (если deletable = false)
}

// Допуск округления до половины дирама.
const EPS = 0.005;

export function fundDeletePlan({ balance, debt, commitments }: FundDeleteInput): FundDeletePlan {
  const blockers: string[] = [];

  if (Math.abs(debt) > EPS) {
    blockers.push(`Есть незакрытые займы (сальдо ${fmt(debt)} TJS). Сначала верните или закройте их.`);
  }
  if (commitments > EPS) {
    blockers.push(`Есть одобренные неоплаченные заявки/счета на ${fmt(commitments)} TJS. Сначала оплатите их или переназначьте фонд.`);
  }

  const deletable = blockers.length === 0;
  const needsTransfer = deletable && balance > EPS;
  return { deletable, needsTransfer, blockers };
}
