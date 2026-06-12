-- Разделение входящих счетов на два раздела (решение заказчика, 2026-06-12):
-- supply     — счета поставщиков: фирмы, поставляющие продукты и хозтовары;
-- obligation — обязательства: долги за оборудование, выполненные услуги, ремонт.
-- Механика общая (два периода, одобрение, оплата fp_pay_bill) — это признак,
-- а не отдельная таблица.

create type public.bill_kind as enum ('supply', 'obligation');

alter table public.supplier_bills
  add column kind bill_kind not null default 'supply';

create index supplier_bills_kind_idx on public.supplier_bills (kind, status);

comment on column public.supplier_bills.kind is
  'supply — поставки продуктов/хозтоваров; obligation — обязательства (оборудование, услуги, ремонт)';
