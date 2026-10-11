import { useState } from "react";
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

/*
 * Rate Calculator: an internal reference tool for base production rates.
 * It reads the user-built master catalog and calculates in the browser; it
 * never creates quotations, invoices, revenue, expenses, receivables or fund
 * transactions.
 */
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
    <div className="space-y-5">
      <PageHeader
        title="Rate Calculator"
        icon={Calculator}
        description="Internal base rates from your own catalog. Add your margin and prepare the quotation elsewhere."
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="calculator">Calculator</TabsTrigger>
          <TabsTrigger value="catalog">Catalog{items.length > 0 ? ` (${items.filter((i) => i.isActive).length})` : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="calculator" className="mt-4">
          <Workspace items={items} categories={categories} isLoading={isLoading} error={error} onRetry={retry} openForm={setForm} />
        </TabsContent>
        <TabsContent value="catalog" className="mt-4">
          <CatalogManager items={items} categories={categories} isLoading={isLoading} error={error} onRetry={retry} openForm={setForm} />
        </TabsContent>
      </Tabs>
      <ItemFormDialog mode={form} onClose={() => setForm(null)} categories={categories} items={items} />
    </div>
  );
}
