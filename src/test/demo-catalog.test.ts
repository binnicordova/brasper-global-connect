// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { createDemoFixtures } from "../lib/demo-fixtures";

describe("Demo catalog for the manual update", () => {
  it("matches the browser scenarios and keeps a chronological audit trail", () => {
    const catalog = JSON.parse(readFileSync("supabase/demo/catalog.json", "utf8"));
    const fixtures = createDemoFixtures(Date.parse("2026-10-12T12:00:00Z"));
    expect(catalog.transfers).toEqual(fixtures.transfers);
    expect(catalog.events).toEqual(fixtures.events);
    for (const transfer of fixtures.transfers) {
      const events = fixtures.events.filter((e) => e.transfer_id === transfer.id);
      expect(events.length).toBeGreaterThan(0);
      expect(
        events.every(
          (e) =>
            e.created_at >= transfer.created_at &&
            e.created_at <= (transfer.updated_at ?? transfer.created_at),
        ),
      ).toBe(true);
      expect(transfer.recipient_amount).toBeGreaterThan(0);
    }
  });
  it("seeds idempotently without changing operations and restricts reads to staff", async () => {
    const db = new PGlite();
    try {
      await db.exec(`create role anon; create role authenticated;
        create function public.is_staff() returns boolean language sql stable as $$select current_setting('test.staff',true)='yes'$$;
        create table public.transfers(id int);insert into public.transfers values(1);`);
      const sql = readFileSync("supabase/demo/seed.sql", "utf8");
      await db.exec(sql);
      await db.exec(sql);
      expect((await db.query("select count(*)::int as n from brasper_demo.catalog")).rows).toEqual([
        { n: 1 },
      ]);
      expect((await db.query("select * from public.transfers")).rows).toEqual([{ id: 1 }]);
      await db.exec("set role authenticated;select set_config('test.staff','no',false)");
      expect((await db.query("select * from brasper_demo.catalog")).rows).toHaveLength(0);
      await db.exec("select set_config('test.staff','yes',false)");
      expect((await db.query("select * from brasper_demo.catalog")).rows).toHaveLength(1);
      await expect(db.exec("delete from brasper_demo.catalog")).rejects.toThrow(
        /permission denied/,
      );
      await db.exec("reset role;set role anon");
      await expect(db.query("select * from brasper_demo.catalog")).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.close();
    }
  }, 20000);
});
