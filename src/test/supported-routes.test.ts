// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";

it("disables USD for new operations without changing history or supported routes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table fx_rates(from_currency text,to_currency text,active boolean);
      create table deposit_accounts(currency text,active boolean);
      create table transfers(from_currency text,to_currency text,amount numeric);
      insert into fx_rates values('USD','BRL',true),('PEN','BRL',true),('BRL','PEN',true);
      insert into deposit_accounts values('USD',true),('PEN',true),('BRL',true);
      insert into transfers values('USD','BRL',300);`);
    await db.exec(readFileSync("supabase/migrations/202610120009_pen_brl_only.sql", "utf8"));
    expect(
      (
        await db.query(
          "select from_currency,to_currency from fx_rates where active order by from_currency",
        )
      ).rows,
    ).toEqual([
      { from_currency: "BRL", to_currency: "PEN" },
      { from_currency: "PEN", to_currency: "BRL" },
    ]);
    expect((await db.query("select amount from transfers")).rows).toEqual([{ amount: "300" }]);
    await expect(
      db.exec("update fx_rates set active=true where from_currency='USD'"),
    ).rejects.toThrow(/active_pen_brl_routes/);
    await expect(db.exec("insert into deposit_accounts values('USD',true)")).rejects.toThrow(
      /active_pen_brl_accounts/,
    );
  } finally {
    await db.close();
  }
}, 20000);
