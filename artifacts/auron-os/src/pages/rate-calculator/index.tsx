import { useState } from "react";
import { motion } from "framer-motion";
import { Calculator } from "lucide-react";
import {
  getListRateCategoriesQueryKey,
  getListRateItemsQueryKey,
  useListRateCategories,
  useListRateItems,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/ds/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Workspace } from "@/components/rate-calculator/workspace";
import { CatalogManager } from "@/components/rate-calculator/catalog-manager";
import { ItemFormDialog, type ItemFormMode } from "@/components/rate-calculator/item-form";
import { DURATION, EASE_OUT } from "@/lib/motion";

/*
 * Rate Calculator: an internal reference tool for base production rates.
 * It reads the user-built master catalog and calculates in the browser,
 * with an optional per-line margin; it never creates quotations, invoices,
 * revenue, expenses, receivables or fund transactions.
 *
 * Motion here follows the app-wide reduced-motion choice (the OS setting
 * or the "Reduced" preference), inherited from the root MotionConfig.
 */
const tabEnter = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: DURATION.base, ease: EASE_OUT } } as const;

export default function RateCalculatorPage() {
  const [tab, setTab] = useState<"calculator" | "catalog">("calculator");
  const [form, setForm] = useState<ItemFormMode | null>(null);

  const itemsQuery = useListRateItems({ query: { queryKey: getListRateItemsQueryKey() } });
  const categoriesQuery = useListRateCategories({ query: { queryKey: getListRateCategoriesQueryKey() } });
  const items = itemsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const isLoading = itemsQuery.isLoading || categoriesQuery.isLoading;
  const error = itemsQuery.error ?? categoriesQuery.error ?? null;
  const retry = () => {
    void itemsQuery.refetch();
    void categoriesQuery.refetch();
  };

  return (
    <>
      <div className="min-w-0 space-y-5">
        <PageHeader
          title="Rate Calculator"
          icon={Calculator}
          description="Internal rates from your own catalog, with an optional margin per line. Prepare the quotation elsewhere."
        />
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="calculator">Calculator</TabsTrigger>
            <TabsTrigger value="catalog">Catalog{items.length > 0 ? ` (${items.filter((i) => i.isActive).length})` : ""}</TabsTrigger>
          </TabsList>
          <TabsContent value="calculator" className="mt-4 min-w-0">
            <motion.div {...tabEnter}>
              <Workspace items={items} categories={categories} isLoading={isLoading} error={error} onRetry={retry} openForm={setForm} />
            </motion.div>
          </TabsContent>
          <TabsContent value="catalog" className="mt-4 min-w-0">
            <motion.div {...tabEnter}>
              <CatalogManager items={items} categories={categories} isLoading={isLoading} error={error} onRetry={retry} openForm={setForm} />
            </motion.div>
          </TabsContent>
        </Tabs>
        <ItemFormDialog mode={form} onClose={() => setForm(null)} categories={categories} items={items} />
      </div>
    </>
  );
}
