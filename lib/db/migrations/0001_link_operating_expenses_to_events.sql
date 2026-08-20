ALTER TABLE "operating_expenses" ADD COLUMN "event_id" integer;
--> statement-breakpoint
ALTER TABLE "operating_expenses"
  ADD CONSTRAINT "operating_expenses_event_id_events_id_fk"
  FOREIGN KEY ("event_id") REFERENCES "public"."events"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX "operating_expenses_event_id_idx" ON "operating_expenses" USING btree ("event_id");