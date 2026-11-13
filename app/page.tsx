"use client";

import { IssuedChecks } from "@/components/issued-checks";
import { Orders } from "@/components/orders";

import { barcodeGeometry, productionLabelHtml } from "@/lib/production-label";
import { parsePackageWeight, presentationParts, presentationQuantityError } from "@/lib/product-inputs";
import { STOCK_REMOVAL_REASONS, stockRemovalError, stockStatusLabel } from "@/lib/stock-removal";

import { useEffect, useMemo, useRef, useState, type Dispatch as StateDispatch, type SetStateAction } from "react";
import Image from "next/image";
import { accountDay, accountDate, accountDefaultRange, accountMoney, summarizeAccount, customerStatementHtml } from "@/lib/account-summary";
import { PRODUCTION_TEAM } from "@/lib/production-team";
import {
  AlertTriangle,
  Archive,
  Calculator,
  Barcode,
  Boxes,
  Building2,
  Check,
  ChevronRight,
  ClipboardList,
  FileText,
  FlaskConical,
  IceCreamBowl,
  LayoutDashboard,
  PackageCheck,
  PackagePlus,
  Pencil,
  Plus,
  Printer,
  Scale,
  Search,
  Store,
  Settings,
  ShoppingBag,
  Trash2,
  Truck,
  WalletCards,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { productCatalog, type Product } from "@/lib/products";
import {
  PRODUCT_FAMILIES,
  discountKeyForFamily,
  findProductFamily,
  normalizeProductFamilyDiscounts,
  type ProductFamilyDefinition,
  type ProductFamilyDiscounts,
} from "@/lib/product-families";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type View =
  | "pedidos"
  | "cheques"
  | "inicio"
  | "produccion"
  | "stock"
  | "eliminados"
  | "historico-produccion"
  | "despacho"
  | "remitos"
  | "reportes"
  | "nueva-compra"
  | "costos"
  | "resultados"
  | "productos"
  | "clientes"
  | "cta-clientes"
  | "usuarios";

type ProductionRecord = {
  registrationId?: string;
  uniqueCode: string;
  productCode: string;
  productName: string;
  container: string;
  weight: number | null;
  units: number | null;
  responsible: string;
  time: string;
  family: string;
  price: number;
  presentation: string;
};
type ProductionHistoryRow = { deletedAt?: string | null; deletedByName?: string | null; deletionReason?: string | null; deletionComment?: string | null; id: number; uniqueCode: string; productCode: string; productName: string; presentation: string; container: string; weightKg: number | null; units: number | null; responsible: string; status: string; costPerKgSnapshot?: number | null; producedAt: string; dispatchedAt: string | null; remittanceNumber: string | null; clientName: string | null };
type StaffMember = { id: number; email: string; displayName: string; role: "produccion" | "encargado" | "administracion"; active: boolean };

function Code128Barcode({ value }: { value: string }) {
  const { digits, bars, width } = barcodeGeometry(value);
  return (
    <svg
      className="barcode-svg h-11 w-full"
      viewBox={`-10 0 ${width} 42`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Código de barras ${digits}`}
      shapeRendering="crispEdges"
    >
      {bars.map((bar, index) => (
        <rect key={index} x={bar.x} y="0" width={bar.width} height="42" fill="#000" />
      ))}
    </svg>
  );
}

function openProductionLabelWindow() {
  const printWindow = window.open("", "_blank", "popup,width=900,height=700");
  if (printWindow) {
    printWindow.document.write("<!doctype html><title>Etiqueta Münna</title><p style='font-family:Arial;padding:24px'>Preparando etiqueta…</p>");
    printWindow.document.close();
  }
  return printWindow;
}

function printProductionLabel(printWindow: Window | null, labelHtml: string) {
  if (!labelHtml || !printWindow) return false;

  const printDocument = printWindow.document;

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join("\n");

  printDocument.open();
  printDocument.write(`<!doctype html>
    <html lang="es">
      <head>
        <base href="${window.location.origin}/">
        ${styles}
        <style>
          @page { size: 100mm 70mm; margin: 0; }
          html, body { width: 100mm; height: 70mm; margin: 0; padding: 0; background: white; }
          body { overflow: hidden; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          #print-production-label {
            visibility: visible !important;
            box-sizing: border-box;
            position: relative !important;
            width: 100mm !important;
            height: 70mm !important;
            max-width: none !important;
            margin: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            overflow: hidden !important;
          }
          #print-production-label * {
            visibility: visible !important;
            border-color: #000 !important;
          }
          #print-production-label > div:not(:last-child) {
            border-bottom: 0.6mm solid #000 !important;
          }
          #print-production-label > div:last-child {
            border-top: 0 !important;
          }
          #print-production-label {
            display: grid !important;
            grid-template-rows: 9mm 14mm 13mm 10mm 18mm !important;
            padding: 2mm !important;
          }
          #print-production-label .label-footer {
            display: grid !important;
            grid-template-columns: 1fr 45mm !important;
            gap: 2mm !important;
            min-height: 0 !important;
          }
          #print-production-label .barcode-svg {
            display: block !important;
            width: 100% !important;
            height: 12mm !important;
          }
        </style>
      </head>
      <body>${labelHtml}</body>
    </html>`);
  printDocument.close();

  const openPrintDialog = async () => {
    await Promise.all(
      Array.from(printDocument.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map(
        (stylesheet) =>
          stylesheet.sheet
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                const finish = () => resolve();
                stylesheet.addEventListener("load", finish, { once: true });
                stylesheet.addEventListener("error", finish, { once: true });
                window.setTimeout(finish, 5000);
              }),
      ),
    );
    if ("fonts" in printDocument) {
      await printDocument.fonts.ready;
    }
    await Promise.all(
      Array.from(printDocument.images).map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            }),
      ),
    );
    await new Promise<void>((resolve) =>
      printWindow.requestAnimationFrame(() =>
        printWindow.requestAnimationFrame(() => resolve()),
      ),
    );
    await new Promise<void>((resolve) => window.setTimeout(resolve, 300));
    printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
    printWindow.focus();
    printWindow.print();
  };

  window.setTimeout(openPrintDialog, 100);

  return true;
}

const menu = [
  ["inicio", "Inicio", LayoutDashboard],
  ["pedidos", "Pedidos y producción", ShoppingBag],
  ["produccion", "Producción", IceCreamBowl],
  ["stock", "Stock de fábrica", Boxes],
  ["eliminados", "Eliminados", Trash2],
  ["historico-produccion", "Histórico producido", ClipboardList],
  ["despacho", "Nuevo despacho", Truck],
  ["remitos", "Remitos", FileText],
  ["reportes", "Reportes", ClipboardList],
] as const;
const adminMenu = [
  ["cheques", "Cheques emitidos", WalletCards],
  ["resultados", "Estado de resultados", WalletCards],
  ["costos", "Costos y formulas", Calculator],
  ["productos", "Productos", ShoppingBag],
  ["clientes", "Clientes", Building2],
  ["cta-clientes", "Cta. cte. clientes", WalletCards],
  ["usuarios", "Usuarios y permisos", Users],
] as const;

const inactiveProductCodes = new Set<string>();
let runtimeProductCatalog: Product[] = [...productCatalog];
const activeProductCatalog = () => runtimeProductCatalog.filter((product) => !inactiveProductCodes.has(product.code));
const productionProducts = () => activeProductCatalog().map(
  (product) => `${product.code} · ${product.name}`,
);
const normalizeComboboxSearch = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("es-AR")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();
const comboboxWordFilter = (itemValue: unknown, query: string) => {
  const searchable = normalizeComboboxSearch(itemValue);
  const terms = normalizeComboboxSearch(query).split(/\s+/).filter(Boolean);
  return terms.every((term) => searchable.includes(term));
};

function AppSidebar({
  view,
  setView,
  role,
  currentUser,
}: {
  view: View;
  setView: (v: View) => void;
  role: StaffMember["role"];
  currentUser: StaffMember | null;
}) {
  const operationItems = role === "produccion" ? menu.filter(([id]) => ["inicio", "produccion", "stock", "eliminados", "despacho", "pedidos"].includes(id)) : menu;
  const administrationItems = role === "administracion" ? adminMenu : [];
  const group = (
    items: readonly (readonly [string, string, typeof LayoutDashboard])[],
  ) => (
    <SidebarMenu>
      {items.map(([id, label, Icon]) => (
        <SidebarMenuItem key={id}>
          <SidebarMenuButton
            asChild
            isActive={view === id}
            tooltip={label}
            className="h-10 rounded-xl data-[active=true]:bg-[#f8dce7] data-[active=true]:font-bold data-[active=true]:text-[#a53d67]"
          >
            <button onClick={() => setView(id as View)}>
              <Icon />
              <span>{label}</span>
            </button>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
  return (
    <Sidebar
      variant="sidebar"
      collapsible="icon"
      className="border-r border-[#f1dbe4] bg-[#fff9fb]"
    >
      <SidebarHeader className="px-4 py-5">
        <button
          onClick={() => setView("inicio")}
          className="flex items-center gap-3 overflow-hidden text-left"
        >
          <div className="relative h-11 w-32 shrink-0 overflow-hidden group-data-[collapsible=icon]:w-11">
            <Image
              src="/munna-laboratorio.jpg"
              fill
              sizes="128px"
              alt="Münna Laboratorio Artesanal"
              className="object-cover object-center group-data-[collapsible=icon]:scale-[1.8]"
            />
          </div>
        </button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operación</SidebarGroupLabel>
          <SidebarGroupContent>{group(operationItems)}</SidebarGroupContent>
        </SidebarGroup>
        {administrationItems.length > 0 && <SidebarGroup>
          <SidebarGroupLabel>Administración</SidebarGroupLabel>
          <SidebarGroupContent>{group(administrationItems)}</SidebarGroupContent>
        </SidebarGroup>}
      </SidebarContent>
      <SidebarFooter className="p-3">
        <div className="flex items-center gap-3 rounded-2xl border bg-white p-3 shadow-sm">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#3b2830] text-xs font-bold text-white">
            {(currentUser?.displayName ?? "Usuario").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-bold">{currentUser?.displayName ?? "Usuario"}</p>
            <p className="text-xs capitalize text-muted-foreground">{currentUser?.role ?? "produccion"}</p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function Header({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-white/90 px-4 backdrop-blur md:px-8">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="text-[#8e4965]" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#bd7791]">
            Münna · Fábrica
          </p>
          <h1 className="text-lg font-black tracking-tight">{title}</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="hidden rounded-full border-[#efc8d7] bg-[#fff5f8] px-3 py-1 text-[#a94068] sm:flex"
        >
          <Scale className="mr-2 size-3" />
          Carga manual de peso
        </Badge>
        <Button variant="outline" size="icon" className="rounded-full">
          <Settings />
        </Button>
      </div>
    </header>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  note,
  tone = "pink",
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  note: string;
  tone?: "pink" | "green" | "amber" | "brown";
}) {
  const colors = {
    pink: "bg-[#fdeaf1] text-[#b44570]",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    brown: "bg-[#f2ece8] text-[#755947]",
  };
  return (
    <article className="rounded-[22px] border bg-white p-5 shadow-[0_10px_35px_rgba(114,65,84,.06)]">
      <div
        className={`mb-4 grid size-10 place-items-center rounded-2xl ${colors[tone]}`}
      >
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{note}</p>
    </article>
  );
}

function Dashboard({ setView, role, currentUser, stock, history }: { setView: (v: View) => void; role: StaffMember["role"]; currentUser: StaffMember | null; stock: ProductionRecord[]; history: ProductionHistoryRow[] }) {
  const firstName = currentUser?.displayName?.trim().split(/\s+/)[0] ?? "";
  const greetingName = currentUser?.email?.toLowerCase() === "evelindemasi@gmail.com" ? "Eve" : firstName;
  const today = new Date();
  const argentinaMonth = (value: Date | string) => new Date(value).toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 7);
  const dateLabel = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" }).format(today);
  const month = argentinaMonth(today);
  const formatAmount = (value: number, maximumFractionDigits = 3) => value.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits });
  const iceCreamKg = stock.filter((row) => row.family === "Helado").reduce((sum, row) => sum + Number(row.weight ?? 0), 0);
  const dispatchedThisMonth = history.filter((row) => row.dispatchedAt && argentinaMonth(row.dispatchedAt) === month).reduce((sum, row) => sum + Number(row.weightKg ?? 0), 0);
  const stockedProducts = new Set(stock.map((row) => row.productCode)).size;
  const recentProduction = [...history].sort((a, b) => new Date(b.producedAt).getTime() - new Date(a.producedAt).getTime()).slice(0, 3);
  const lastDispatchedRow = [...history]
    .filter((row) => row.dispatchedAt && row.remittanceNumber)
    .sort((a, b) => new Date(b.dispatchedAt ?? 0).getTime() - new Date(a.dispatchedAt ?? 0).getTime())[0];
  const lastDispatchRows = lastDispatchedRow ? history.filter((row) => row.remittanceNumber === lastDispatchedRow.remittanceNumber) : [];
  const lastDispatchKg = lastDispatchRows.reduce((sum, row) => sum + Number(row.weightKg ?? 0), 0);
  const operationalSummary = history.length === 0
    ? "Todavía no hay producción cargada. El sistema está listo para comenzar."
    : stock.length === 0
      ? "No hay unidades disponibles en fábrica; toda la producción registrada fue despachada."
      : `Hay ${stock.length} ${stock.length === 1 ? "unidad disponible" : "unidades disponibles"} correspondientes a ${stockedProducts} ${stockedProducts === 1 ? "producto" : "productos"}.`;
  return (
    <div className="space-y-7">
      <section className="munna-hero relative overflow-hidden rounded-[28px] bg-[#3c2931] px-6 py-7 text-white md:px-9">
        <div className="relative z-10 max-w-xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-[#f2a9c4]">
            {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
          </p>
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">
            Buen día{greetingName ? `, ${greetingName}` : ""}.
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-[#e9dce1]">
            {operationalSummary}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              onClick={() => setView("produccion")}
              className="rounded-xl bg-[#ef94b6] text-[#39252d] hover:bg-[#f3a9c5]"
            >
              <Plus />
              Registrar producción
            </Button>
            <Button
              onClick={() => setView("despacho")}
              variant="outline"
              className="rounded-xl border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <Truck />
              Nuevo despacho
            </Button>
            {role === "administracion" && <Button
              onClick={() => setView("nueva-compra")}
              variant="outline"
              className="rounded-xl border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <PackagePlus />
              Nueva compra
            </Button>}
          </div>
        </div>
        <div className="absolute -right-20 -top-24 size-72 rounded-full border-[42px] border-[#ef94b6]/15" />
        <div className="absolute bottom-[-72px] right-28 size-44 rounded-full bg-[#ef94b6]/10" />
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Boxes}
          label="Unidades disponibles"
          value={formatAmount(stock.length, 0)}
          note="Baldes, vasquetas y cajas"
        />
        <Metric
          icon={Scale}
          label="Helado disponible"
          value={`${formatAmount(iceCreamKg)} kg`}
          note="Peso neto en cámara"
          tone="green"
        />
        <Metric
          icon={Truck}
          label="Despachado este mes"
          value={`${formatAmount(dispatchedThisMonth)} kg`}
          note="A todas las sucursales"
          tone="brown"
        />
        <Metric
          icon={Archive}
          label="Productos en stock"
          value={formatAmount(stockedProducts, 0)}
          note="Variedades disponibles"
          tone="amber"
        />
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.45fr_.75fr]">
        <div className="rounded-[24px] border bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="font-black">Última producción</h3>
              <p className="text-sm text-muted-foreground">
                Unidades ingresadas hoy
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => setView("produccion")}
              className="text-[#aa426b]"
            >
              Ver todas
            </Button>
          </div>
          <div className="space-y-2">
            {recentProduction.length === 0 && <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Todavía no hay producción registrada.</div>}
            {recentProduction.map((row) => (
              <div
                key={row.uniqueCode}
                className="flex items-center gap-4 rounded-2xl p-3 hover:bg-[#fff9fb]"
              >
                <div className="grid size-10 place-items-center rounded-xl bg-[#fdeaf1] text-[#ae456d]">
                  <Barcode className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{row.productName} · {row.container}</p>
                  <p className="text-xs text-muted-foreground">
                    #{row.uniqueCode} · {row.responsible}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black">{row.weightKg != null ? `${formatAmount(Number(row.weightKg))} kg` : `${row.units ?? 0} u.`}</p>
                  <p className="text-xs text-muted-foreground">{new Date(row.producedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[24px] border bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="font-black">Último despacho</h3>
              <p className="text-sm text-muted-foreground">
                {lastDispatchedRow ? "Último remito confirmado" : "Sin remitos registrados"}
              </p>
            </div>
            {lastDispatchedRow && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Confirmado</span>}
          </div>
          <div className="rounded-2xl bg-[#fff5f8] p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-[#b56a86]">
              {lastDispatchedRow?.clientName ?? "Sin despachos"}
            </p>
            <p className="mt-1 text-2xl font-black">{lastDispatchedRow?.remittanceNumber ?? "Todavía no hay remitos"}</p>
            <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Escaneados</p>
                <p className="font-black">{lastDispatchRows.length} {lastDispatchRows.length === 1 ? "producto" : "productos"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Peso neto</p>
                <p className="font-black">{formatAmount(lastDispatchKg)} kg</p>
              </div>
            </div>
          </div>
          <Button
            onClick={() => setView(lastDispatchedRow ? "remitos" : "despacho")}
            className="mt-4 w-full rounded-xl bg-[#3c2931] text-white"
          >
            {lastDispatchedRow ? "Ver remitos" : "Crear primer despacho"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Production({
  records,
  onRegister,
  onFinalize,
  responsibleOptions,
}: {
  records: ProductionRecord[];
  onRegister: (record: ProductionRecord) => Promise<ProductionRecord>;
  onFinalize: () => void;
  responsibleOptions: StaffMember[];
}) {
  const [saved, setSaved] = useState(false);
  const [savedCode, setSavedCode] = useState("");
  const savedLabel = useRef("");
  const registration = useRef<{ key: string; id: string } | null>(null);
  const registrationInProgress = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [product, setProduct] = useState("");
  const [weight, setWeight] = useState("7.155");
  const [quantity, setQuantity] = useState("20");
  const [responsible, setResponsible] = useState("");
  const producerNames = Array.from(new Set<string>([...PRODUCTION_TEAM, ...responsibleOptions.filter((member) => member.active).map((member) => member.displayName)]));
  const selectedResponsible = responsible || "";
  const selectedProduct = activeProductCatalog().find(
    (item) => `${item.code} · ${item.name}` === product,
  );
  const isWeightProduct = selectedProduct?.family === "Helado";
  const displayedWeight = weight.trim() || "0.000";
  const normalizeWeight = (value: string) => {
    const cleaned = value.replace(/,/g, ".").replace(/[^0-9.]/g, "");
    const [whole, ...decimals] = cleaned.split(".");
    return decimals.length
      ? `${whole}.${decimals.join("").slice(0, 3)}`
      : whole;
  };
  const shiftKg = records.reduce((total, record) => total + (record.weight ?? 0), 0);
  const shiftUnits = records.reduce((total, record) => total + (record.units ?? 0), 0);
  return (
    <div className="space-y-6">
    <div className="grid gap-6 xl:grid-cols-[1fr_.78fr]">
      <section className="rounded-[26px] border bg-white p-6 shadow-sm">
        <Badge className="mb-3 rounded-full bg-[#fde7ef] text-[#a94068] hover:bg-[#fde7ef]">
          Nueva unidad
        </Badge>
        <h2 className="text-2xl font-black">Registrar producción</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Seleccioná el producto, ingresá el peso neto que marca la balanza e
          imprimí su etiqueta.
        </p>
        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-bold">
            Producto
            <Combobox
              disabled={saving}
              items={productionProducts()}
              value={product}
              onValueChange={(value) => {
                if (!value) return;
                setProduct(value);
                const nextProduct = activeProductCatalog().find((item) => `${item.code} · ${item.name}` === value);
                const unitsInPresentation = nextProduct?.presentation.match(/x\s*(\d+)/i)?.[1];
                setQuantity(unitsInPresentation ?? "1");
                setSaved(false);
              }}
            >
              <ComboboxInput
                autoFocus
                placeholder="Escribí nombre o código…"
                className="h-11 w-full rounded-xl bg-white font-normal"
              />
              <ComboboxContent>
                <ComboboxEmpty>No encontramos ese producto.</ComboboxEmpty>
                <ComboboxList>
                  {(item) => (
                    <ComboboxItem key={item} value={item}>
                      {item}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </label>
          <label className="space-y-2 text-sm font-bold">
            Envase
            <Input
              value={selectedProduct?.container ?? ""}
              placeholder="Se completa con el producto"
              readOnly
              className="h-11 rounded-xl font-normal"
            />
          </label>
        </div>
        <label className="my-6 block rounded-3xl bg-[#3c2931] p-6 text-white">
          <span className="text-xs font-bold uppercase tracking-wider text-[#e6b3c6]">
            {isWeightProduct ? "Peso neto ingresado manualmente" : "Cantidad incluida en la presentación"}
          </span>
          <span className="mt-3 flex items-center gap-3">
            {isWeightProduct ? (
              <>
                <Input
                  disabled={saving}
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => {
                    setWeight(normalizeWeight(e.target.value));
                    setSaved(false);
                  }}
                  aria-label="Peso neto en kilogramos"
                  className="h-16 border-white/20 bg-white text-right text-4xl font-black text-[#3c2931] focus-visible:ring-[#f2a2c0]"
                />
                <span className="text-xl font-black">kg</span>
              </>
            ) : (
              <>
                <Input
                  disabled={saving}
                  inputMode="numeric"
                  value={quantity}
                  onChange={(event) => {
                    setQuantity(event.target.value.replace(/\D/g, ""));
                    setSaved(false);
                  }}
                  aria-label="Cantidad de unidades"
                  className="h-16 border-white/20 bg-white text-right text-4xl font-black text-[#3c2931] focus-visible:ring-[#f2a2c0]"
                />
                <span className="text-xl font-black">unidades</span>
              </>
            )}
          </span>
          <span className="mt-2 block text-xs text-[#e6cfd8]">
              {isWeightProduct
                ? "Tará el envase y escribí el peso con punto. Ejemplo: 7.155"
                : `Presentación configurada: ${selectedProduct?.presentation ?? "seleccioná un producto"}.`}
          </span>
        </label>
        <p className="text-sm text-muted-foreground">Responsable de producción: Evelin De Masi. Elegí quién elaboró esta unidad.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-bold">
            Elaborado por
            <select disabled={saving} value={selectedResponsible} onChange={(event) => { setResponsible(event.target.value); setSaved(false); }} className="h-11 w-full rounded-xl border bg-white px-3 font-normal">
              <option value="" disabled>Seleccioná quién elaboró</option>
              {producerNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-sm font-bold">
            Vencimiento
            <Input
              value="27/08/2027"
              readOnly
              className="h-11 rounded-xl font-normal"
            />
          </label>
        </div>
        <Button
          disabled={!product || !selectedProduct || !selectedResponsible || saved || saving || (isWeightProduct ? !weight.trim() : !quantity.trim())}
          onClick={async () => {
            if (!selectedProduct || registrationInProgress.current) return;
            const label = document.getElementById("print-production-label");
            if (!label) { setSaveError("No se encontró la etiqueta. Recargá la página."); return; }
            const frozenLabel = label.cloneNode(true) as HTMLElement;
            const key = JSON.stringify([selectedProduct.code, weight, quantity, selectedResponsible, selectedProduct.price]);
            if (registration.current?.key !== key) registration.current = { key, id: crypto.randomUUID() };
            registrationInProgress.current = true;
            const printWindow = openProductionLabelWindow();
            setSaving(true);
            setSaveError("");
            try {
              const registered = await onRegister({
                registrationId: registration.current.id,
                uniqueCode: "",
                productCode: selectedProduct.code,
                productName: selectedProduct.name,
                container: selectedProduct.container,
                weight: isWeightProduct ? Number(weight) : null,
                units: isWeightProduct ? null : Number(quantity),
                responsible: selectedResponsible,
                time: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
                family: selectedProduct.family,
                price: selectedProduct.price,
                presentation: selectedProduct.presentation,
              });
              const html = productionLabelHtml(frozenLabel, registered.uniqueCode);
              savedLabel.current = html;
              setSavedCode(registered.uniqueCode);
              setSaved(true);
              registration.current = null;
              if (!printProductionLabel(printWindow, html)) {
                setSaveError("La producción se guardó, pero Chrome bloqueó la ventana de impresión. Habilitá las ventanas emergentes y usá Reimprimir etiqueta.");
              }
            } catch (error) {
              printWindow?.close();
              setSaveError(error instanceof Error ? error.message : "No se pudo registrar la producción.");
            } finally {
              registrationInProgress.current = false;
              setSaving(false);
            }
          }}
          className="mt-7 h-12 w-full rounded-xl bg-[#ed94b5] text-base font-black text-[#3c2931] hover:bg-[#f2a8c3]"
        >
          {saving ? "Guardando…" : saved ? (
            <>
              <Check />
              Producción registrada
            </>
          ) : (
            <>
              <Printer />
              Registrar e imprimir etiqueta
            </>
          )}
        </Button>
        {saved && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSaveError("");
              const printWindow = openProductionLabelWindow();
              if (!printProductionLabel(printWindow, savedLabel.current)) {
                setSaveError("Chrome bloqueó la ventana de impresión. Habilitá las ventanas emergentes y volvé a intentarlo.");
              }
            }}
            className="mt-3 h-11 w-full rounded-xl"
          >
            <Printer />
            Reimprimir etiqueta
          </Button>
        )}
        {saveError && <p className="mt-3 text-sm font-bold text-red-600">{saveError}</p>}
      </section>
      <section className="rounded-[26px] border bg-[#fff9fb] p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#b96484]">
              Vista previa
            </p>
            <h3 className="font-black">Etiqueta 100 × 70 mm</h3>
          </div>
          <Printer className="text-[#b44570]" />
        </div>
        <div
          id="print-production-label"
          className="production-label mx-auto max-w-xl overflow-hidden rounded-xl border-2 border-black bg-white text-black shadow-lg"
          style={{ display: "grid", gridTemplateRows: "9mm 14mm 13mm 10mm 18mm", padding: "2mm", boxSizing: "border-box" }}
        >
          <div className="flex min-h-0 items-center justify-between border-b-2 border-black">
            <div className="relative h-7 w-40 overflow-hidden">
              <Image
                src="/munna-laboratorio.jpg"
                fill
                sizes="176px"
                alt="Münna"
                className="logo-monochrome object-cover"
                style={{ objectPosition: "center 42%" }}
              />
            </div>
            <div className="text-right leading-tight">
              <p className="text-[8px] font-bold">CÓDIGO ÚNICO</p>
              <p data-production-code="hash" className="text-sm font-black">{saved ? "#" + savedCode : "Se asigna al guardar"}</p>
            </div>
          </div>

          <div className="min-h-0 overflow-hidden border-b border-black py-1">
            <h3 className="text-[18px] font-black uppercase leading-[18px]">
              {selectedProduct?.name ?? "Seleccioná un producto"}
            </h3>
            <p className="text-[11px] font-bold leading-3">{selectedProduct?.container ?? "—"}</p>
          </div>

          <div className="flex min-h-0 flex-col items-center justify-center border-b-2 border-black text-center">
            <p className="text-[8px] font-bold uppercase leading-none">{isWeightProduct ? "Peso neto" : "Contenido"}</p>
            <p className="text-[24px] font-black leading-none">
              {isWeightProduct ? `${displayedWeight} kg` : `${quantity || "0"} unidades`}
            </p>
          </div>

          <div className="grid min-h-0 grid-cols-3 items-center gap-2 overflow-hidden text-[8px] leading-[9px]">
            <p><b>Elaboración</b><br />27/08/2026</p>
            <p><b>Vencimiento</b><br />27/08/2027</p>
            <p><b>Lote</b><br />270826-CHM-01</p>
          </div>

          <div className="label-footer min-h-0 grid grid-cols-[1fr_170px] items-start gap-2 overflow-hidden border-t border-black pt-1">
            <div className="min-h-0 overflow-hidden text-[6px] leading-[7px]">
              <p className="line-clamp-2"><b>Ingredientes:</b> {selectedProduct?.ingredients || "Pendientes de completar."}</p>
              <p className="font-black uppercase">Contiene leche y derivados.</p>
              <p className="mt-0.5 font-black">INDUSTRIA ARGENTINA</p>
              <p>Elaborado por: Julián Reverter</p>
              <p>Planta: Juan B. Justo 1531, Pergamino, Bs. As.</p>
              <p>Tel.: 2477 667357</p>
              <p><b>RNE:</b> pendiente · <b>RNPA:</b> pendiente</p>
            </div>
            <div className="overflow-hidden pt-1">
              <div data-production-barcode>{saved ? <Code128Barcode value={savedCode} /> : <p className="py-3 text-center text-xs">Vista previa · sin código asignado</p>}</div>
              <p data-production-code="plain" className="text-center font-mono text-[9px] leading-none tracking-[.28em]">{saved ? savedCode : "Pendiente"}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
      <section className="rounded-[26px] border bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#b65d7f]">Turno actual</p>
            <h2 className="text-2xl font-black">Producción acumulada</h2>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <div className="rounded-xl bg-[#fff4f8] px-4 py-2 text-right">
              <p className="text-xs text-muted-foreground">Registros</p>
              <p className="text-xl font-black">{records.length}</p>
            </div>
            <div className="rounded-xl bg-[#f2f7f3] px-4 py-2 text-right">
              <p className="text-xs text-muted-foreground">Kg netos</p>
              <p className="text-xl font-black">{shiftKg.toFixed(3)}</p>
            </div>
            <div className="rounded-xl bg-amber-50 px-4 py-2 text-right">
              <p className="text-xs text-muted-foreground">Unidades elaboradas</p>
              <p className="text-xl font-black">{shiftUnits}</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={records.length === 0} className="h-auto rounded-xl border-[#d9b6c4] px-4 font-bold text-[#8e4965]">
                  Finalizar turno
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Finalizar el turno de producción?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se limpiará el acumulado del turno. Todo lo producido continuará disponible en el stock de fábrica.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Seguir trabajando</AlertDialogCancel>
                  <AlertDialogAction onClick={onFinalize} className="bg-[#3c2931] text-white hover:bg-[#513842]">
                    Finalizar turno
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        {records.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Todavía no registraste producción en este turno.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border">
            <Table>
              <TableHeader className="bg-[#fff4f8]">
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Código único</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Envase</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Responsable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...records].reverse().map((record) => (
                  <TableRow key={record.uniqueCode}>
                    <TableCell>{record.time}</TableCell>
                    <TableCell className="font-mono font-bold">{record.uniqueCode}</TableCell>
                    <TableCell className="font-bold">{record.productName}</TableCell>
                    <TableCell>{record.container}</TableCell>
                    <TableCell className="text-right font-black">
                      {record.weight !== null ? `${record.weight.toFixed(3)} kg` : `${record.units} unidades`}
                    </TableCell>
                    <TableCell>{record.responsible}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stock({ records, onRemove }: { records: ProductionRecord[]; onRemove: (code: string, reason: string, comment: string) => Promise<void> }) {
  const [selectedCode, setSelectedCode] = useState("");
  const [candidateCodes, setCandidateCodes] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = records.find((record) => record.uniqueCode === selectedCode);
  const openRemoval = (codes: string[]) => {
    setCandidateCodes(codes); setSelectedCode(codes.length === 1 ? codes[0] : "");
    setReason(""); setComment(""); setError(""); setNotice("");
  };
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const compactQuery = normalizedQuery.replace(/[^a-z0-9]/g, "");
  const shiftKg = records.reduce((total, record) => total + (record.weight ?? 0), 0);
  const { rows, exactCodeMatch } = useMemo(() => {
      const exactRecord = compactQuery
        ? records.find((record) => record.uniqueCode.toLowerCase().replace(/[^a-z0-9]/g, "") === compactQuery)
        : undefined;
      if (exactRecord) {
        return {
          exactCodeMatch: true,
          rows: [{
            key: `unit-${exactRecord.uniqueCode}`,
            code: exactRecord.productCode,
            name: exactRecord.productName,
            pack: exactRecord.container,
            units: exactRecord.units ?? 1,
            kg: exactRecord.weight != null ? exactRecord.weight.toFixed(3).replace(".", ",") : "—",
            status: "En stock",
            uniqueCodes: [exactRecord.uniqueCode],
          }],
        };
      }
      const grouped = new Map<string, { code: string; name: string; pack: string; units: number; kgValue: number; status: string; uniqueCodes: string[] }>();
      for (const record of records) {
        const current = grouped.get(record.productCode) ?? {
          code: record.productCode,
          name: record.productName,
          pack: record.container,
          units: 0,
          kgValue: 0,
          status: "Ingresado hoy",
          uniqueCodes: [],
        };
        current.units += record.units ?? 1;
        current.kgValue += record.weight ?? 0;
        current.uniqueCodes.push(record.uniqueCode);
        grouped.set(record.productCode, current);
      }
      const producedRows = [...grouped.values()].map((row) => ({
        key: `product-${row.code}`,
        code: row.code,
        name: row.name,
        pack: row.pack,
        units: row.units,
        kg: row.kgValue > 0 ? row.kgValue.toFixed(3).replace(".", ",") : "—",
        status: row.status,
        uniqueCodes: row.uniqueCodes,
      }));
      return {
        exactCodeMatch: false,
        rows: producedRows.filter((row) => {
          const haystack = `${row.name} ${row.code} ${row.pack} ${row.uniqueCodes.join(" ")}`.toLowerCase();
          return !normalizedQuery || haystack.includes(normalizedQuery) || haystack.replace(/[^a-z0-9]/g, "").includes(compactQuery);
        }),
      };
    }, [compactQuery, normalizedQuery, records]);
  return (
    <section className="rounded-[26px] border bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-black">Stock disponible en fábrica</h2>
          <p className="text-sm text-muted-foreground">
            {records.length} unidades etiquetadas · {shiftKg.toLocaleString("es-AR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg netos
          </p>
          {exactCodeMatch && <p className="mt-1 text-xs font-bold text-emerald-700">Código encontrado: esta unidad está disponible en fábrica.</p>}
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto, código o código de barra"
            className="h-10 rounded-xl pl-9"
          />
        </div>
      </div>
      {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <div className="overflow-x-auto"><Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Códigos de barra</TableHead>
            <TableHead>Producto</TableHead>
            <TableHead>Presentación</TableHead>
            <TableHead className="text-right">Unidades</TableHead>
            <TableHead className="text-right">Kg netos</TableHead>
            <TableHead>Estado</TableHead><TableHead>Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No hay stock disponible para esta búsqueda.</TableCell></TableRow>}
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="font-mono text-xs">
                {row.code}
              </TableCell>
              <TableCell>
                {row.uniqueCodes.length > 0 ? <div className="flex max-w-72 flex-wrap gap-1">{row.uniqueCodes.map((code) => <Badge key={code} variant="outline" className="font-mono text-[10px]">#{code}</Badge>)}</div> : <span className="text-xs text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="font-bold">{row.name}</TableCell>
              <TableCell>{row.pack}</TableCell>
              <TableCell className="text-right font-black">
                {row.units}
              </TableCell>
              <TableCell className="text-right">{row.kg}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    row.status === "Ingresado hoy"
                      ? "border-[#efc8d7] bg-[#fff5f8] text-[#a94068]"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }
                >
                  {row.status}
                </Badge>
              </TableCell>
              <TableCell><Button variant="outline" size="sm" className="text-red-700" onClick={() => openRemoval(row.uniqueCodes)}><Trash2 className="size-4" /> Eliminar</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table></div>
      <Dialog open={candidateCodes.length > 0} onOpenChange={(open) => { if (!open && !saving) setCandidateCodes([]); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Eliminar unidad del stock</DialogTitle><DialogDescription>La unidad saldrá del stock de fábrica y quedará registrada en Eliminados. Se conservará su producción original.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <label className="block text-sm font-bold">Unidad / código de barras
              <select className="mt-1 h-11 w-full rounded-md border bg-white px-3" value={selectedCode} disabled={saving} onChange={(event) => setSelectedCode(event.target.value)}>
                <option value="">Elegí la unidad a eliminar</option>
                {candidateCodes.map((code) => { const record = records.find((item) => item.uniqueCode === code); return <option key={code} value={code}>#{code} · {record?.weight != null ? record.weight.toLocaleString("es-AR", { minimumFractionDigits: 3 }) + " kg" : (record?.units ?? 0) + " u."}</option>; })}
              </select>
            </label>
            {selected && <div className="rounded-xl bg-[#fff5f8] p-3 text-sm"><b>{selected.productName}</b><p>{selected.presentation} · Elaboró: {selected.responsible}</p></div>}
            <label className="block text-sm font-bold">Motivo
              <select className="mt-1 h-11 w-full rounded-md border bg-white px-3" value={reason} disabled={saving} onChange={(event) => setReason(event.target.value)}><option value="">Elegí un motivo</option>{STOCK_REMOVAL_REASONS.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="block text-sm font-bold">Comentario {reason === "Otro" ? "(obligatorio)" : "(opcional)"}
              <Textarea className="mt-1" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} required={reason === "Otro"} disabled={saving} placeholder="Explicá qué pasó con esta unidad" />
            </label>
            {reason === "Mal formulado (a desperdicio)" && <p className="text-sm text-amber-800">Esta baja quedará identificada como desperdicio.</p>}
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          </div>
          <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setCandidateCodes([])}>Cancelar</Button><Button className="bg-red-600 text-white hover:bg-red-700" disabled={saving || !selected || !!stockRemovalError(reason, comment)} onClick={async () => {
            if (saving || !selected) return;
            const validation = stockRemovalError(reason, comment); if (validation) { setError(validation); return; }
            setSaving(true); setError("");
            try { await onRemove(selectedCode, reason, comment.trim()); setCandidateCodes([]); setNotice("Unidad #" + selectedCode + " eliminada. Podés consultar el detalle en Eliminados."); }
            catch (error) { setError(error instanceof Error ? error.message : "No se pudo eliminar la unidad."); }
            finally { setSaving(false); }
          }}>{saving ? "Eliminando…" : "Confirmar eliminación"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function DeletedStock({ rows }: { rows: ProductionHistoryRow[] }) {
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const deleted = rows.filter((row) => row.status === "baja").filter((row) => {
    const day = row.deletedAt ? new Date(row.deletedAt).toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }) : "";
    const text = [row.uniqueCode, row.productCode, row.productName, row.responsible, row.deletedByName, row.deletionReason, row.deletionComment].join(" ").toLocaleLowerCase("es-AR");
    return text.includes(query.trim().toLocaleLowerCase("es-AR")) && (!reason || row.deletionReason === reason) && (!from || day >= from) && (!to || day <= to);
  }).sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
  return <section className="space-y-5">
    <div className="rounded-3xl border bg-white p-6 shadow-sm"><Badge className="bg-red-50 text-red-700">Control de bajas</Badge><h2 className="mt-3 text-3xl font-black">Eliminados</h2><p className="mt-1 text-muted-foreground">Historial de unidades retiradas del stock de fábrica, con motivo, comentario y responsable de la baja.</p><p className="mt-3 text-sm font-bold">{deleted.length} registros · {deleted.reduce((sum, row) => sum + Number(row.weightKg ?? 0), 0).toLocaleString("es-AR", { minimumFractionDigits: 3 })} kg · {deleted.reduce((sum, row) => sum + Number(row.units ?? 0), 0)} unidades</p></div>
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4"><label className="min-w-52 flex-1 text-sm font-bold">Buscar<Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Producto, código, persona o comentario" /></label><label className="text-sm font-bold">Motivo<select className="block h-10 rounded-md border bg-white px-3" value={reason} onChange={(event) => setReason(event.target.value)}><option value="">Todos</option>{STOCK_REMOVAL_REASONS.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-bold">Desde<Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="text-sm font-bold">Hasta<Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div>
    <div className="overflow-x-auto rounded-3xl border bg-white shadow-sm"><Table><TableHeader><TableRow><TableHead>Fecha de baja</TableHead><TableHead>Código / producto</TableHead><TableHead>Kg / unidades</TableHead><TableHead>Producción original</TableHead><TableHead>Eliminó</TableHead><TableHead>Motivo</TableHead><TableHead>Comentario</TableHead></TableRow></TableHeader><TableBody>
      {deleted.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No hay eliminados para estos filtros.</TableCell></TableRow>}
      {deleted.map((row) => <TableRow key={row.id}><TableCell className="whitespace-nowrap">{row.deletedAt ? new Date(row.deletedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "Sin fecha registrada"}</TableCell><TableCell><b className="font-mono">#{row.uniqueCode}</b><p className="font-bold">{row.productName}</p><p className="text-xs text-muted-foreground">{row.productCode} · {row.presentation}</p></TableCell><TableCell className="whitespace-nowrap">{row.weightKg != null ? Number(row.weightKg).toLocaleString("es-AR", { minimumFractionDigits: 3 }) + " kg" : (row.units ?? 0) + " u."}</TableCell><TableCell><b>{row.responsible}</b><p className="text-xs text-muted-foreground">{new Date(row.producedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</p></TableCell><TableCell>{row.deletedByName ?? "Sin responsable registrado"}</TableCell><TableCell><Badge variant="outline" className="whitespace-normal text-red-700">{row.deletionReason ?? "Sin motivo registrado"}</Badge></TableCell><TableCell className="min-w-48 max-w-sm whitespace-pre-wrap break-words">{row.deletionComment || "Sin comentario"}</TableCell></TableRow>)}
    </TableBody></Table></div>
  </section>;
}

function ProductionHistory({ rows, canSeeCosts }: { rows: ProductionHistoryRow[]; canSeeCosts: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos");
  const normalizedQuery = query.trim().toLowerCase();
  const compactQuery = normalizedQuery.replace(/[^a-z0-9]/g, "");
  const filtered = rows.filter((row) => {
    const haystack = `${row.uniqueCode} ${row.productCode} ${row.productName} ${row.responsible} ${row.clientName ?? ""} ${row.remittanceNumber ?? ""}`.toLowerCase();
    const compactHaystack = haystack.replace(/[^a-z0-9]/g, "");
    const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery) || compactHaystack.includes(compactQuery);
    return matchesQuery && (status === "Todos" || (status === "En stock" ? row.status === "stock" : status === "Eliminados" ? row.status === "baja" : row.status === "despachado"));
  });
  const exportExcel = () => {
    const escape = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const headings = ["Fecha y hora producción", "Código único", "Código producto", "Producto", "Presentación", "Kg", "Unidades"];
    if (canSeeCosts) headings.push("Costo por kg", "Costo exacto producido");
    headings.push("Responsable", "Estado", "Destino", "Remito", "Fecha despacho");
    const body = filtered.map((row) => {
      const cells: unknown[] = [new Date(row.producedAt).toLocaleString("es-AR"), row.uniqueCode, row.productCode, row.productName, row.presentation, row.weightKg ?? "", row.units ?? ""];
      if (canSeeCosts) cells.push(row.costPerKgSnapshot ?? "", row.weightKg != null && row.costPerKgSnapshot != null ? Number(row.weightKg) * Number(row.costPerKgSnapshot) : "");
      cells.push(row.responsible, stockStatusLabel(row.status), row.clientName ?? "", row.remittanceNumber ?? "", row.dispatchedAt ? new Date(row.dispatchedAt).toLocaleString("es-AR") : "");
      return `<tr>${cells.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`;
    }).join("");
    const html = `<html><head><meta charset="UTF-8"></head><body><table border="1"><tr>${headings.map((heading) => `<th>${escape(heading)}</th>`).join("")}</tr>${body}</table></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `historico-produccion-${new Date().toISOString().slice(0, 10)}.xls`; link.click(); URL.revokeObjectURL(url);
  };
  return <section className="space-y-5"><div className="flex flex-col gap-4 rounded-3xl border bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between"><div><Badge className="bg-[#f4d5e1] text-[#983f62]">Trazabilidad</Badge><h2 className="mt-3 text-3xl font-black">Histórico de producción</h2><p className="mt-1 text-muted-foreground">Seguimiento completo desde la elaboración hasta la sucursal de destino.</p></div><Button onClick={exportExcel} className="rounded-xl bg-[#3b2931] text-white"><FileText /> Descargar Excel</Button></div><div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar sabor, código, responsable, sucursal o remito" className="pl-9"/></div><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-md border bg-white px-3"><option>Todos</option><option>En stock</option><option>Despachados</option><option>Eliminados</option></select></div><div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Producción</TableHead><TableHead>Código</TableHead><TableHead>Producto</TableHead><TableHead>Kg / unidades</TableHead>{canSeeCosts && <TableHead className="text-right">Costo producido</TableHead>}<TableHead>Responsable</TableHead><TableHead>Estado</TableHead><TableHead>Destino / remito</TableHead></TableRow></TableHeader><TableBody>{filtered.length === 0 && <TableRow><TableCell colSpan={canSeeCosts ? 8 : 7} className="py-10 text-center text-muted-foreground">No hay registros para estos filtros.</TableCell></TableRow>}{filtered.map((row) => <TableRow key={row.id}><TableCell className="whitespace-nowrap"><b>{new Date(row.producedAt).toLocaleDateString("es-AR")}</b><div className="text-xs text-muted-foreground">{new Date(row.producedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</div></TableCell><TableCell className="font-mono font-bold">{row.uniqueCode}</TableCell><TableCell><b>{row.productName}</b><div className="text-xs text-muted-foreground">{row.productCode} · {row.presentation}</div></TableCell><TableCell>{row.weightKg != null ? `${Number(row.weightKg).toLocaleString("es-AR", { minimumFractionDigits: 3 })} kg` : `${row.units ?? 0} u.`}</TableCell>{canSeeCosts && <TableCell className="text-right">{row.weightKg != null && row.costPerKgSnapshot != null ? <><b>{money(Number(row.weightKg) * Number(row.costPerKgSnapshot))}</b><div className="text-xs text-muted-foreground">{money(Number(row.costPerKgSnapshot))}/kg</div></> : <span className="text-muted-foreground">Sin fórmula</span>}</TableCell>}<TableCell>{row.responsible}</TableCell><TableCell><Badge className={row.status === "stock" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}>{stockStatusLabel(row.status)}</Badge></TableCell><TableCell>{row.clientName ? <><b>{row.clientName}</b><div className="text-xs text-muted-foreground">{row.remittanceNumber} · {row.dispatchedAt ? new Date(row.dispatchedAt).toLocaleDateString("es-AR") : ""}</div></> : <span className="text-muted-foreground">Sin despacho</span>}</TableCell></TableRow>)}</TableBody></Table></div></div></section>;
}

function Reports({ rows, canSeeCosts }: { rows: ProductionHistoryRow[]; canSeeCosts: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T23:59:59`).getTime();
  const costPerKg = (row: ProductionHistoryRow) => Number(row.costPerKgSnapshot ?? 0);
  const periodRows = rows.filter((row) => { const time = new Date(row.producedAt).getTime(); return time >= start && time <= end; });
  const producedKg = periodRows.reduce((sum, row) => sum + Number(row.weightKg ?? 0), 0);
  const productionCost = periodRows.reduce((sum, row) => sum + Number(row.weightKg ?? 0) * costPerKg(row), 0);
  const openingRows = rows.filter((row) => new Date(row.producedAt).getTime() < start && (!row.dispatchedAt || new Date(row.dispatchedAt).getTime() >= start) && (!row.deletedAt || new Date(row.deletedAt).getTime() >= start));
  const currentRows = rows.filter((row) => row.status === "stock");
  const stockData = (source: ProductionHistoryRow[]) => ({ kg: source.reduce((sum, row) => sum + Number(row.weightKg ?? 0), 0), value: source.reduce((sum, row) => sum + Number(row.weightKg ?? 0) * costPerKg(row), 0) });
  const opening = stockData(openingRows), current = stockData(currentRows);
  const delivered = rows.filter((row) => row.dispatchedAt && new Date(row.dispatchedAt).getTime() >= start && new Date(row.dispatchedAt).getTime() <= end);
  const deliveredKg = delivered.reduce((sum, row) => sum + Number(row.weightKg ?? 0), 0);
  const byClient = Object.values(delivered.reduce<Record<string, { name: string; kg: number; cost: number }>>((acc, row) => { const name = row.clientName ?? "Sin destino"; acc[name] ??= { name, kg: 0, cost: 0 }; acc[name].kg += Number(row.weightKg ?? 0); acc[name].cost += Number(row.weightKg ?? 0) * costPerKg(row); return acc; }, {})).sort((a, b) => b.kg - a.kg);
  const byPerson = Object.values(periodRows.reduce<Record<string, { name: string; kg: number; units: number; records: number }>>((acc, row) => { acc[row.responsible] ??= { name: row.responsible, kg: 0, units: 0, records: 0 }; acc[row.responsible].kg += Number(row.weightKg ?? 0); acc[row.responsible].units += Number(row.units ?? 0); acc[row.responsible].records += 1; return acc; }, {})).sort((a, b) => b.kg - a.kg);
  const byFlavor = Object.values(periodRows.reduce<Record<string, { name: string; kg: number; cost: number }>>((acc, row) => { acc[row.productName] ??= { name: row.productName, kg: 0, cost: 0 }; acc[row.productName].kg += Number(row.weightKg ?? 0); acc[row.productName].cost += Number(row.weightKg ?? 0) * costPerKg(row); return acc; }, {})).sort((a, b) => b.kg - a.kg).slice(0, 8);
  const costCoverage = periodRows.length ? Math.round(periodRows.filter((row) => costPerKg(row) > 0).length / periodRows.length * 100) : 100;
  const metrics = canSeeCosts
    ? [["Producción total", `${producedKg.toLocaleString("es-AR", { maximumFractionDigits: 1 })} kg`, `${periodRows.length} unidades o cajas`], ["Costo de producción", money(productionCost), `Promedio ${producedKg ? money(productionCost / producedKg) : money(0)} por kg`], ["Stock inicial", `${opening.kg.toLocaleString("es-AR", { maximumFractionDigits: 1 })} kg`, `Valorizado en ${money(opening.value)}`], ["Stock actual", `${current.kg.toLocaleString("es-AR", { maximumFractionDigits: 1 })} kg`, `Valorizado en ${money(current.value)}`]]
    : [["Producción total", `${producedKg.toLocaleString("es-AR", { maximumFractionDigits: 1 })} kg`, `${periodRows.length} unidades o cajas`], ["Stock inicial", `${opening.kg.toLocaleString("es-AR", { maximumFractionDigits: 1 })} kg`, "Al comienzo del período"], ["Stock actual", `${current.kg.toLocaleString("es-AR", { maximumFractionDigits: 1 })} kg`, "Disponible en fábrica"], ["Despachado en el período", `${deliveredKg.toLocaleString("es-AR", { maximumFractionDigits: 1 })} kg`, `${delivered.length} unidades o cajas`]];
  return <section className="space-y-5"><div className="flex flex-col gap-4 rounded-3xl border bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between"><div><Badge className="bg-[#f4d5e1] text-[#983f62]">Análisis</Badge><h2 className="mt-3 text-3xl font-black">Reportes de producción</h2><p className="mt-1 text-muted-foreground">{canSeeCosts ? "Producción, costos, inventario y rendimiento por destino y persona." : "Producción, inventario y rendimiento por destino y persona."}</p></div><div className="flex gap-3"><label className="text-xs font-bold">Desde<Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1"/></label><label className="text-xs font-bold">Hasta<Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1"/></label></div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label,value,note]) => <div key={label} className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-sm font-bold text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-black">{value}</p><p className="mt-2 text-xs text-muted-foreground">{note}</p></div>)}</div>
    {canSeeCosts && <div className="rounded-2xl border bg-[#fff8fb] p-4 text-sm"><b>Cobertura de costos de fórmulas: {costCoverage}%.</b> {costCoverage < 100 ? "Las unidades sin fórmula valorizada se computan con costo $0 hasta completar su receta." : "Todos los registros del período tienen costo configurado."}</div>}
    <div className="grid gap-5 xl:grid-cols-2"><div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b p-5"><h3 className="text-xl font-black">Kg enviados por cliente</h3><p className="text-sm text-muted-foreground">Despachos realizados dentro del período.</p></div><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead className="text-right">Kg</TableHead>{canSeeCosts && <TableHead className="text-right">Costo</TableHead>}</TableRow></TableHeader><TableBody>{byClient.length === 0 && <TableRow><TableCell colSpan={canSeeCosts ? 3 : 2} className="text-center text-muted-foreground">Sin despachos</TableCell></TableRow>}{byClient.map((row) => <TableRow key={row.name}><TableCell className="font-bold">{row.name}</TableCell><TableCell className="text-right">{row.kg.toLocaleString("es-AR", { maximumFractionDigits: 1 })}</TableCell>{canSeeCosts && <TableCell className="text-right font-bold">{money(row.cost)}</TableCell>}</TableRow>)}</TableBody></Table></div><div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b p-5"><h3 className="text-xl font-black">Producción por persona</h3><p className="text-sm text-muted-foreground">Rendimiento individual del equipo.</p></div><Table><TableHeader><TableRow><TableHead>Responsable</TableHead><TableHead className="text-right">Kg</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Registros</TableHead></TableRow></TableHeader><TableBody>{byPerson.map((row) => <TableRow key={row.name}><TableCell className="font-bold">{row.name}</TableCell><TableCell className="text-right">{row.kg.toLocaleString("es-AR", { maximumFractionDigits: 1 })}</TableCell><TableCell className="text-right">{row.units}</TableCell><TableCell className="text-right">{row.records}</TableCell></TableRow>)}</TableBody></Table></div></div>
    <div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b p-5"><h3 className="text-xl font-black">Sabores más producidos</h3><p className="text-sm text-muted-foreground">{canSeeCosts ? "Volumen y costo por producto durante el período." : "Volumen producido por producto durante el período."}</p></div><Table><TableHeader><TableRow><TableHead>Producto</TableHead><TableHead className="text-right">Kg producidos</TableHead>{canSeeCosts && <><TableHead className="text-right">Costo total</TableHead><TableHead className="text-right">Costo/kg</TableHead></>}</TableRow></TableHeader><TableBody>{byFlavor.map((row) => <TableRow key={row.name}><TableCell className="font-bold">{row.name}</TableCell><TableCell className="text-right">{row.kg.toLocaleString("es-AR", { maximumFractionDigits: 1 })}</TableCell>{canSeeCosts && <><TableCell className="text-right">{money(row.cost)}</TableCell><TableCell className="text-right">{row.kg ? money(row.cost / row.kg) : money(0)}</TableCell></>}</TableRow>)}</TableBody></Table></div>
  </section>;
}

function discountFor(client: Client, family: string, productFamilies: ProductFamilyDefinition[]) {
  const discountKey = discountKeyForFamily(family, productFamilies);
  return discountKey ? client.discounts[discountKey] ?? 0 : 0;
}

function Dispatch({ clients, productFamilies, availableUnits, onConfirm }: { clients: Client[]; productFamilies: ProductFamilyDefinition[]; availableUnits: ProductionRecord[]; onConfirm: (codes: string[], client: Client) => Promise<void> }) {
  const [clientId, setClientId] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [lines, setLines] = useState<ProductionRecord[]>([]);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const selectedClient = clients.find((client) => client.active && String(client.id) === clientId);
  const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  const tareFor = (record: ProductionRecord) => record.container.toLowerCase().includes("balde") ? 0.28 : 0.12;
  const lineAmount = (record: ProductionRecord) => {
    if (!selectedClient) return 0;
    const billableWeight = record.weight === null ? null : record.weight + (selectedClient.billingWeight === "Bruto" ? tareFor(record) : 0);
    const quantity = billableWeight ?? record.units ?? 0;
    const subtotal = quantity * record.price;
    return subtotal * (1 - discountFor(selectedClient, record.family, productFamilies) / 100);
  };
  const total = lines.reduce((sum, record) => sum + lineAmount(record), 0);
  const totalWeight = lines.reduce((sum, record) => sum + (record.weight ?? 0), 0);
  const scan = (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;
    if (lines.some((record) => record.uniqueCode.toUpperCase() === code)) {
      setMessage({ type: "error", text: `El código ${code} ya está incluido en este remito.` });
      setScanValue("");
      return;
    }
    const found = availableUnits.find((record) => record.uniqueCode.toUpperCase() === code);
    if (!found) {
      setMessage({ type: "error", text: `El código ${code} no está disponible en el stock de fábrica.` });
      setScanValue("");
      return;
    }
    setLines((current) => [...current, found]);
    setMessage({ type: "ok", text: `${found.productName} agregado correctamente.` });
    setScanValue("");
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[.72fr_1.28fr]">
      <section className="rounded-[26px] border bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.15em] text-[#b65d7f]">Remito nuevo</p>
        <h2 className="mt-1 text-2xl font-black">Destino del despacho</h2>
        <label className="mt-5 block space-y-2 text-sm font-bold">
          Cliente o sucursal
          <select required value={selectedClient ? clientId : ""} onChange={(event) => { setClientId(event.target.value); setMessage(null); }} className="h-12 w-full rounded-xl border bg-white px-3 font-normal">
            <option value="">Seleccionar</option>
            {clients.filter((client) => client.active).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        {selectedClient && <div className="mt-6 space-y-4">
          <div className="rounded-2xl bg-[#fff4f8] p-4">
            <p className="text-xs text-muted-foreground">Descuentos asignados</p>
            <p className="mt-1 text-sm font-black">{productFamilies.map((family) => `${family.label} ${selectedClient?.discounts[family.discountKey] ?? 0}%`).join(" · ")}</p>
          </div>
          <div className="rounded-2xl bg-[#f2f7f3] p-4">
            <p className="text-xs text-muted-foreground">Modalidad de envase</p>
            <p className="text-sm font-black">{selectedClient?.returnable ? "Retornable" : "No retornable"} · cobra peso {selectedClient?.billingWeight.toLowerCase()}</p>
          </div>
        </div>}
        <div className="mt-7">
          <p className="mb-2 text-sm font-bold">Escanear código único</p>
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); scan(scanValue); }}>
            <Input autoFocus value={scanValue} onChange={(event) => setScanValue(event.target.value)} placeholder="Escaneá o escribí el código…" className="h-12 rounded-xl font-mono" />
            <Button type="submit" size="icon" className="size-12 rounded-xl bg-[#3c2931]"><Barcode /></Button>
          </form>
          {message && <p className={`mt-2 text-sm font-bold ${message.type === "error" ? "text-red-600" : "text-emerald-700"}`}>{message.text}</p>}

        </div>
      </section>
      <section className="rounded-[26px] border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#b65d7f]">Remito nuevo</p><h2 className="mt-1 text-2xl font-black">Carga del camión</h2></div>
          <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50">Borrador</Badge>
        </div>
        <div className="mt-6 space-y-2">
          {lines.length === 0 && <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Todavía no escaneaste productos.</div>}
          {lines.map((record) => (
            <div key={record.uniqueCode} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border p-3">
              <div className="grid size-9 place-items-center rounded-xl bg-[#fbe7ef] text-[#ad416a]"><PackageCheck className="size-4" /></div>
              <div>
                <p className="text-sm font-bold">{record.productName}</p>
                <p className="text-xs text-muted-foreground">#{record.uniqueCode} · {record.weight !== null ? `${record.weight.toLocaleString("es-AR", { minimumFractionDigits: 3 })} kg ${selectedClient ? selectedClient.billingWeight.toLowerCase() : "netos"}` : `${record.units} unidades × ${currency.format(record.price)} c/u`}{selectedClient && ` · Desc. ${discountFor(selectedClient, record.family, productFamilies)}%`}</p>
              </div>
              <div className="text-right"><p className="text-sm font-black">{selectedClient ? currency.format(lineAmount(record)) : "—"}</p><button onClick={() => setLines((current) => current.filter((item) => item.uniqueCode !== record.uniqueCode))} className="text-xs font-bold text-[#a94068]">Quitar</button></div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-end justify-between border-t pt-5">
          <div><p className="text-sm text-muted-foreground">{lines.length} productos escaneados</p><p className="text-sm font-bold">Peso neto: {totalWeight.toLocaleString("es-AR", { minimumFractionDigits: 3 })} kg</p></div>
          <div className="text-right"><p className="text-xs uppercase text-muted-foreground">Total con descuento</p><p className="text-3xl font-black">{selectedClient ? currency.format(total) : "—"}</p></div>
        </div>
        {!selectedClient && <p className="mt-4 text-sm text-muted-foreground">Seleccioná un cliente o sucursal para confirmar el despacho.</p>}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild><Button disabled={!lines.length || !selectedClient} className="mt-5 h-12 w-full rounded-xl bg-[#ed94b5] font-black text-[#3c2931] hover:bg-[#f2a8c3]"><FileText /> Confirmar y generar remito</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>¿Confirmar despacho a {selectedClient?.name}?</AlertDialogTitle><AlertDialogDescription>Los {lines.length} productos se descontarán del stock de fábrica y quedará generado el remito.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Volver</AlertDialogCancel><AlertDialogAction disabled={saving || !selectedClient || !lines.length} onClick={async (event) => { event.preventDefault(); if (saving || !selectedClient || !lines.length) return; setSaving(true); try { await onConfirm(lines.map((record) => record.uniqueCode), selectedClient); setLines([]); setClientId(""); setConfirmOpen(false); setMessage({ type: "ok", text: "Despacho confirmado, remito generado y stock actualizado." }); } catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo confirmar el despacho." }); } finally { setSaving(false); } }} className="bg-[#ed94b5] font-black text-[#3c2931] hover:bg-[#f2a8c3]">{saving ? "Guardando…" : "Confirmar despacho"}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}

type ProductProfile = Product & { packageWeightKg?: number; unitType?: "kg" | "unidad"; active?: boolean };

function Products({ productFamilies, setProductFamilies }: { productFamilies: ProductFamilyDefinition[]; setProductFamilies: StateDispatch<SetStateAction<ProductFamilyDefinition[]>> }) {
  const [products, setProducts] = useState<ProductProfile[]>(productCatalog);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<(ProductProfile & { packageWeightInput?: string }) | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingCode, setDeletingCode] = useState("");
  const [familyOpen, setFamilyOpen] = useState(false);
  const [familyName, setFamilyName] = useState("");
  const [savingFamily, setSavingFamily] = useState(false);
  const [archivingFamilyId, setArchivingFamilyId] = useState<number | null>(null);
  const [familyError, setFamilyError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/operations")
      .then(async (response) => {
        const data = await response.json() as { productProfiles?: ProductProfile[]; productFamilies?: ProductFamilyDefinition[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "No se pudieron cargar los perfiles.");
        if (data.productFamilies?.length) setProductFamilies(data.productFamilies);
        const saved = data.productProfiles ?? [];
        for (const product of saved) {
          if (product.active === false) inactiveProductCodes.add(product.code);
          else inactiveProductCodes.delete(product.code);
        }
        const activeSaved = saved.filter((item) => item.active !== false);
        const byCode = new Map(activeSaved.map((item) => [item.code, item]));
        const catalogCodes = new Set(productCatalog.map((item) => item.code));
        const merged = productCatalog.map((item) => ({ ...item, ...byCode.get(item.code) }));
        runtimeProductCatalog = [...merged, ...activeSaved.filter((item) => !catalogCodes.has(item.code))];
        setProducts(runtimeProductCatalog.filter((item) => !inactiveProductCodes.has(item.code)));
      })
      .catch((error) => setSaveError(error instanceof Error ? error.message : "No se pudieron cargar los perfiles."));
  }, [setProductFamilies]);

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return products;
    return products.filter((product) =>
      `${product.code} ${product.name} ${product.family} ${product.presentation}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [products, query]);
  const currency = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
  const needsPackageWeight = (product: ProductProfile) =>
    findProductFamily(product.family, productFamilies)?.requiresPackageWeight === true;
  const familyCounts = useMemo(() => new Map(productFamilies.map((family) => [
    family.value,
    products.filter((product) => product.family === family.value).length,
  ])), [productFamilies, products]);
  const emptyProduct = (): ProductProfile => ({
    code: "",
    name: "",
    family: productFamilies[0]?.value ?? PRODUCT_FAMILIES[0].value,
    presentation: "",
    container: "",
    price: 0,
    ingredients: "",
    expiryDays: 365,
    packageWeightKg: 0,
    active: true,
  });

  const saveProductProfile = async () => {
    if (!editing) return;
    if (!editing.code.trim() || !editing.name.trim()) {
      setSaveError("Completá el código y el nombre del producto.");
      return;
    }
    if (!findProductFamily(editing.family, productFamilies)) {
      setSaveError("Elegí una familia de productos de la lista.");
      return;
    }
    if (isCreating && products.some((product) => product.code.trim().toLocaleLowerCase("es-AR") === editing.code.trim().toLocaleLowerCase("es-AR"))) {
      setSaveError("Ya existe un producto con ese código.");
      return;
    }
    const weight = parsePackageWeight(editing.packageWeightInput ?? editing.packageWeightKg ?? 0);
    const quantityError = presentationQuantityError(editing.presentation);
    if (quantityError) { setSaveError(quantityError); return; }
    if (needsPackageWeight(editing) && (weight === null || weight <= 0)) {
      setSaveError("Indicá el peso neto en kg, mayor a cero y con hasta 3 decimales. Podés usar coma o punto.");
      return;
    }
    const { packageWeightInput: _draftWeight, ...profile } = editing;
    const productToSave: ProductProfile = { ...profile, packageWeightKg: weight ?? editing.packageWeightKg ?? 0 };
    setSaving(true);
    setSaveError("");
    setMessage("");
    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-product-profile", product: productToSave, creating: isCreating }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "No se pudo guardar el producto.");
      inactiveProductCodes.delete(editing.code);
      const savedProduct = { ...productToSave, active: true };
      runtimeProductCatalog = runtimeProductCatalog.some((item) => item.code === editing.code)
        ? runtimeProductCatalog.map((item) => item.code === editing.code ? savedProduct : item)
        : [...runtimeProductCatalog, savedProduct];
      setProducts((current) => current.some((item) => item.code === editing.code)
        ? current.map((item) => item.code === editing.code ? savedProduct : item)
        : [...current, savedProduct].sort((a, b) => a.name.localeCompare(b.name, "es")));
      setEditing(null);
      setIsCreating(false);
      setMessage(isCreating ? "Producto creado correctamente." : "Producto actualizado correctamente.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el producto.");
    } finally {
      setSaving(false);
    }
  };

  const saveProductFamily = async () => {
    if (!familyName.trim()) {
      setFamilyError("Ingresá el nombre de la familia.");
      return;
    }
    setSavingFamily(true);
    setFamilyError("");
    setMessage("");
    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-product-family", productFamily: { name: familyName } }),
      });
      const data = await response.json() as { productFamily?: ProductFamilyDefinition; error?: string };
      if (!response.ok || !data.productFamily) throw new Error(data.error ?? "No se pudo crear la familia.");
      setProductFamilies((current) => current.some((family) => family.id === data.productFamily?.id)
        ? current.map((family) => family.id === data.productFamily?.id ? data.productFamily as ProductFamilyDefinition : family)
        : [...current, data.productFamily as ProductFamilyDefinition]);
      setFamilyName("");
      setFamilyOpen(false);
      setMessage(`${data.productFamily.label} fue agregada y ya está disponible al crear productos.`);
    } catch (error) {
      setFamilyError(error instanceof Error ? error.message : "No se pudo crear la familia.");
    } finally {
      setSavingFamily(false);
    }
  };

  const archiveProductFamily = async (family: ProductFamilyDefinition) => {
    if (!family.id) return;
    setArchivingFamilyId(family.id);
    setFamilyError("");
    setSaveError("");
    setMessage("");
    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive-product-family", productFamilyId: family.id }),
      });
      const data = await response.json() as { archived?: boolean; error?: string };
      if (!response.ok || !data.archived) throw new Error(data.error ?? "No se pudo eliminar la familia.");
      setProductFamilies((current) => current.filter((item) => item.id !== family.id));
      setMessage(`${family.label} fue eliminada. Los datos históricos se conservaron.`);
    } catch (error) {
      setFamilyError(error instanceof Error ? error.message : "No se pudo eliminar la familia.");
    } finally {
      setArchivingFamilyId(null);
    }
  };

  const archiveProduct = async (product: ProductProfile) => {
    setDeletingCode(product.code);
    setSaveError("");
    setMessage("");
    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive-product", product }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "No se pudo eliminar el producto.");
      inactiveProductCodes.add(product.code);
      setProducts((current) => current.filter((item) => item.code !== product.code));
      setMessage(`${product.name} fue eliminado. El historial y los remitos anteriores se conservaron.`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo eliminar el producto.");
    } finally {
      setDeletingCode("");
    }
  };

  return (
    <section className="rounded-[26px] border bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-black">Maestro de productos</h2>
          <p className="text-sm text-muted-foreground">
            {products.length} productos activos · podés editar o eliminar cualquiera
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, código o familia" className="h-10 rounded-xl pl-9" />
          </div>
          <Button onClick={() => { setSaveError(""); setMessage(""); setIsCreating(true); setEditing(emptyProduct()); }} className="rounded-xl bg-[#ed94b5] font-black text-[#3c2931] hover:bg-[#f2a8c3]">
            <Plus /> Nuevo producto
          </Button>
        </div>
      </div>
      {message && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p>}
      {saveError && !editing && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{saveError}</p>}
      <div className="mb-5 rounded-2xl border bg-[#fff8fb] p-4">
        <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="font-black">Familias de productos</p>
            <p className="text-xs text-muted-foreground">Esta lista se usa al crear productos y para los descuentos de cada cliente.</p>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl bg-white" onClick={() => { setFamilyError(""); setFamilyName(""); setFamilyOpen(true); }}>
            <Plus /> Nueva familia
          </Button>
        </div>
        {familyError && !familyOpen && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{familyError}</p>}
        <div className="flex flex-wrap gap-2">
          {productFamilies.map((family) => (
            <div key={family.id ?? family.value} className="flex items-center overflow-hidden rounded-full border bg-white pl-3 text-sm">
              <span className="py-1.5">{family.label} · {familyCounts.get(family.value) ?? 0}</span>
              {family.id && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button type="button" aria-label={`Eliminar ${family.label}`} className="ml-2 grid self-stretch place-items-center border-l px-2 text-muted-foreground hover:bg-red-50 hover:text-red-700"><Trash2 className="size-3.5" /></button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>¿Eliminar la familia {family.label}?</AlertDialogTitle><AlertDialogDescription>Solo se podrá eliminar si no tiene productos activos. Los datos históricos se conservarán.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={archivingFamilyId === family.id} onClick={() => archiveProductFamily(family)} className="bg-red-600 text-white hover:bg-red-700">{archivingFamilyId === family.id ? "Eliminando…" : "Sí, eliminar"}</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="max-h-[650px] overflow-auto rounded-2xl border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-[#fff4f8]">
            <TableRow>
              <TableHead>Código</TableHead><TableHead>Producto</TableHead><TableHead>Familia</TableHead><TableHead>Presentación</TableHead><TableHead className="text-right">Kg presentación</TableHead><TableHead className="text-right">Precio base</TableHead><TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((product) => (
              <TableRow key={product.code}>
                <TableCell className="font-mono font-bold">{product.code}</TableCell>
                <TableCell className="font-bold">{product.name}</TableCell>
                <TableCell>{product.family}</TableCell>
                <TableCell>{product.presentation}</TableCell>
                <TableCell className="text-right">{Number(product.packageWeightKg ?? 0) > 0 ? `${Number(product.packageWeightKg).toLocaleString("es-AR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg` : "—"}</TableCell>
                <TableCell className="text-right font-semibold">{currency.format(product.price)}</TableCell>
                <TableCell className="text-right"><div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" className="rounded-lg" onClick={() => { setSaveError(""); setMessage(""); setIsCreating(false); setEditing({ ...product }); }}>Editar</Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="rounded-lg border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800">Eliminar</Button></AlertDialogTrigger>
                    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Eliminar {product.name}?</AlertDialogTitle><AlertDialogDescription>Se quitará de Productos, Producción y Fórmulas. El historial producido y los remitos anteriores se conservarán.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={deletingCode === product.code} onClick={() => archiveProduct(product)} className="bg-red-600 text-white hover:bg-red-700">{deletingCode === product.code ? "Eliminando…" : "Sí, eliminar"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                  </AlertDialog>
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Eliminar archiva el producto: deja de aparecer para movimientos nuevos, pero mantiene intacta la trazabilidad anterior.</p>
      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) { setEditing(null); setIsCreating(false); setSaveError(""); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{isCreating ? "Nuevo producto" : "Editar producto"}</DialogTitle><DialogDescription>Configurá la familia, la presentación y su peso para que el sistema pueda calcular el costo real.</DialogDescription></DialogHeader>
          {editing && (
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-bold">Código<Input value={editing.code} readOnly={!isCreating} onChange={(event) => setEditing({ ...editing, code: event.target.value })} className="font-mono font-normal" /></label>
              <label className="space-y-2 text-sm font-bold">Precio base<Input type="number" value={editing.price} onChange={(event) => setEditing({ ...editing, price: Number(event.target.value) })} className="font-normal" /></label>
              <label className="space-y-2 text-sm font-bold sm:col-span-2">Nombre para sistema y etiqueta<Input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="font-normal" /></label>
              <label className="space-y-2 text-sm font-bold">Familia<select value={editing.family} onChange={(event) => setEditing({ ...editing, family: event.target.value })} className="h-10 w-full rounded-md border bg-white px-3 font-normal">{productFamilies.map((family) => <option key={family.value} value={family.value}>{family.label}</option>)}</select></label>
              <label className="space-y-2 text-sm font-bold">Presentación<Input value={editing.presentation} onChange={(event) => setEditing({ ...editing, presentation: event.target.value })} className="font-normal" /></label>
              {presentationParts(editing.presentation) && <label className="space-y-2 text-sm font-bold">Unidades por presentación<Input type="number" inputMode="numeric" min="1" step="1" value={presentationParts(editing.presentation)?.quantity ?? ""} onChange={(event) => { const parts = presentationParts(editing.presentation); if (parts && /^\d*$/.test(event.target.value)) setEditing({ ...editing, presentation: parts.label + " x " + event.target.value }); }} className="font-normal" /><span className="block text-xs font-normal text-muted-foreground">Ejemplo: 10 guarda la presentación como «Caja x 10».</span></label>}
              <label className="space-y-2 text-sm font-bold">Envase<Input value={editing.container} onChange={(event) => setEditing({ ...editing, container: event.target.value })} className="font-normal" /></label>
              <label className="space-y-2 text-sm font-bold">Vencimiento (días)<Input type="number" value={editing.expiryDays} onChange={(event) => setEditing({ ...editing, expiryDays: Number(event.target.value) })} className="font-normal" /></label>
              {needsPackageWeight(editing) && <label className="space-y-2 text-sm font-bold sm:col-span-2">Peso neto de la presentación (kg)<Input type="text" value={editing.packageWeightInput ?? (editing.packageWeightKg ? String(editing.packageWeightKg).replace(".", ",") : "")} onChange={(event) => setEditing({ ...editing, packageWeightInput: event.target.value })} inputMode="decimal" placeholder="Ej. 7,120" className="font-normal" /><span className="block text-xs font-normal text-muted-foreground">Peso total del contenido de la presentación, sin el envase. Acepta coma o punto (ej. 0,750 kg). La fórmula se expresa por 1 kg; el costo se multiplica por este peso. Al cambiar la cantidad por caja, revisá también este peso.</span></label>}
              <label className="space-y-2 text-sm font-bold sm:col-span-2">Ingredientes<Textarea value={editing.ingredients} placeholder="Pendiente de completar" onChange={(event) => setEditing({ ...editing, ingredients: event.target.value })} className="min-h-24 font-normal" /></label>
            </div>
          )}
          {saveError && editing && <p className="text-sm font-bold text-red-600">{saveError}</p>}
          <DialogFooter><Button variant="outline" onClick={() => { setEditing(null); setIsCreating(false); }}>Cancelar</Button><Button disabled={saving} className="bg-[#ed94b5] font-black text-[#3c2931] hover:bg-[#f2a8c3]" onClick={saveProductProfile}>{saving ? "Guardando…" : isCreating ? "Crear producto" : "Guardar cambios"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={familyOpen} onOpenChange={(open) => { setFamilyOpen(open); if (!open) { setFamilyName(""); setFamilyError(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nueva familia de productos</DialogTitle><DialogDescription>Escribí el nombre que querés ver en Productos, Clientes y Despachos.</DialogDescription></DialogHeader>
          <label className="space-y-2 text-sm font-bold">Nombre de la familia<Input autoFocus value={familyName} onChange={(event) => setFamilyName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveProductFamily(); } }} placeholder="Ej. Chocolatería" className="font-normal" /></label>
          {familyError && <p className="text-sm font-bold text-red-600">{familyError}</p>}
          <DialogFooter><Button variant="outline" onClick={() => setFamilyOpen(false)}>Cancelar</Button><Button disabled={savingFamily || !familyName.trim()} onClick={saveProductFamily} className="bg-[#ed94b5] font-black text-[#3c2931] hover:bg-[#f2a8c3]">{savingFamily ? "Guardando…" : "Crear familia"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
type Client = {
  id: number;
  name: string;
  kind: string;
  discounts: ProductFamilyDiscounts;
  returnable: boolean;
  billingWeight: "Neto" | "Bruto";
  active: boolean;
};

const initialClients: Client[] = [
  { id: 1, name: "Franquicia Rojas", kind: "Franquicia", discounts: normalizeProductFamilyDiscounts({ helado: 50, postres: 35, pasteleria: 30, insumos: 10, indumentaria: 0 }), returnable: true, billingWeight: "Neto", active: true },
  { id: 2, name: "Sucursal Av. de Mayo", kind: "Sucursal propia", discounts: normalizeProductFamilyDiscounts({ helado: 50, postres: 35, pasteleria: 30, insumos: 10, indumentaria: 0 }), returnable: true, billingWeight: "Neto", active: true },
  { id: 3, name: "Sucursal Centenario", kind: "Sucursal propia", discounts: normalizeProductFamilyDiscounts({ helado: 50, postres: 35, pasteleria: 30, insumos: 10, indumentaria: 0 }), returnable: true, billingWeight: "Neto", active: true },
  { id: 4, name: "Evento ocasional", kind: "Evento", discounts: normalizeProductFamilyDiscounts({}), returnable: false, billingWeight: "Bruto", active: true },
];

function Clients({ clients, setClients, productFamilies }: { clients: Client[]; setClients: StateDispatch<SetStateAction<Client[]>>; productFamilies: ProductFamilyDefinition[] }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [message, setMessage] = useState("");
  const filtered = clients.filter((client) =>
    `${client.name} ${client.kind}`.toLowerCase().includes(query.toLowerCase()),
  );
  const emptyClient = (): Client => ({
    id: 0,
    name: "",
    kind: "Franquicia",
    discounts: normalizeProductFamilyDiscounts({}, productFamilies),
    returnable: true,
    billingWeight: "Neto",
    active: true,
  });
  const saveClient = async () => {
    if (!editing?.name.trim()) return;
    setSaving(true);
    setSaveError("");
    setMessage("");
    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-client", client: editing }),
      });
      const data = await response.json() as { client?: Client; error?: string };
      if (!response.ok || !data.client) throw new Error(data.error ?? "No se pudo guardar el cliente.");
      setClients((current) => current.some((client) => client.id === data.client?.id)
        ? current.map((client) => client.id === data.client?.id ? data.client as Client : client)
        : [...current, data.client as Client].sort((a, b) => a.name.localeCompare(b.name, "es")));
      setEditing(null);
      setMessage("Cliente guardado correctamente.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el cliente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[26px] border bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-black">Clientes</h2>
          <p className="text-sm text-muted-foreground">
            Descuento y tratamiento del envase configurados por cliente.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente" className="h-10 rounded-xl pl-9" />
          </div>
          <Button onClick={() => { setSaveError(""); setMessage(""); setEditing(emptyClient()); }} className="rounded-xl bg-[#ed94b5] font-black text-[#3c2931] hover:bg-[#f2a8c3]">
            <Plus /> Nuevo cliente
          </Button>
        </div>
      </div>
      {message && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p>}
      {saveError && !editing && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{saveError}</p>}
      <div className="overflow-hidden rounded-2xl border">
        <Table className="min-w-[1080px] table-fixed">
          <TableHeader className="bg-[#fff4f8]">
            <TableRow>
              <TableHead className="w-[19%] px-4">Cliente</TableHead>
              <TableHead className="w-[12%]">Tipo</TableHead>
              <TableHead className="w-[39%]">Descuentos por línea</TableHead>
              <TableHead className="w-[12%]">Envase</TableHead>
              <TableHead className="w-[10%]">Peso facturable</TableHead>
              <TableHead className="w-[8%] px-4 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="whitespace-normal px-4 font-bold leading-5">{client.name}</TableCell>
                <TableCell className="whitespace-normal leading-5">{client.kind}</TableCell>
                <TableCell className="whitespace-normal py-3 align-top">
                  <div className="flex flex-wrap gap-1.5">
                    {productFamilies.map((family) => (
                      <span key={family.discountKey} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[#efd8e1] bg-[#fff8fb] px-2 py-1 text-xs text-[#5b414b]">
                        {family.label} <b>{client.discounts[family.discountKey] ?? 0}%</b>
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="whitespace-nowrap rounded-full">
                    {client.returnable ? "Retornable" : "No retornable"}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{client.billingWeight}</TableCell>
                <TableCell className="px-4 text-right">
                  <Button variant="outline" size="sm" className="rounded-lg" onClick={() => { setSaveError(""); setMessage(""); setEditing({ ...client, discounts: normalizeProductFamilyDiscounts(client.discounts, productFamilies) }); }}>
                    Editar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing && clients.some((client) => client.id === editing.id) ? "Editar cliente" : "Nuevo cliente"}</DialogT…39167 tokens truncated…t-xl font-black">Consumo por proveedor</h3><p className="text-sm text-muted-foreground">Cuánto se compró a cada proveedor en el rango seleccionado.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Proveedor</TableHead><TableHead className="text-right">Importe</TableHead><TableHead className="text-right">% del total</TableHead></TableRow></TableHeader><TableBody>{expenseBySupplier.length === 0 && <TableRow><TableCell colSpan={3} className="py-10 text-center text-muted-foreground">No hay proveedores para estos filtros.</TableCell></TableRow>}{expenseBySupplier.map((row) => <TableRow key={row.supplier}><TableCell className="font-bold">{row.supplier}</TableCell><TableCell className="text-right font-black">{money(row.amount)}</TableCell><TableCell className="text-right text-muted-foreground">{expenseAnalysisTotal ? (row.amount / expenseAnalysisTotal * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) : "0"}%</TableCell></TableRow>)}</TableBody></Table></div></div>
        </div>
        <div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="flex flex-col gap-2 border-b p-5 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-xl font-black">Detalle de gastos</h3><p className="text-sm text-muted-foreground">Cada renglón conserva proveedor, comprobante, categoría y destino.</p></div><p className="text-sm font-bold">{filteredExpenseAnalysisRows.length} movimientos · {money(expenseAnalysisTotal)}</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Destino</TableHead><TableHead>Tipo / categoría</TableHead><TableHead>Concepto</TableHead><TableHead>Proveedor / comprobante</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader><TableBody>{filteredExpenseAnalysisRows.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No hay gastos que coincidan con los filtros.</TableCell></TableRow>}{filteredExpenseAnalysisRows.map((row) => <TableRow key={row.id}><TableCell className="whitespace-nowrap">{new Date(`${row.date}T12:00:00`).toLocaleDateString("es-AR")}</TableCell><TableCell><Badge variant="outline">{row.center}</Badge></TableCell><TableCell><div className="font-bold">{categoryLabel(row.category)}</div><div className="text-xs text-muted-foreground">{row.kind === "material" ? "Materia prima" : row.kind === "service" ? "Servicio" : "Otro gasto"}</div></TableCell><TableCell>{row.concept}</TableCell><TableCell><div className="font-medium">{row.supplier}</div><div className="text-xs text-muted-foreground">{row.invoice}</div></TableCell><TableCell className="text-right font-black">{money(row.amount)}</TableCell></TableRow>)}</TableBody></Table></div></div>
      </div>}

      {tab === "iva" && <div className="space-y-5"><div className="flex flex-col gap-4 rounded-3xl border bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><Badge className="bg-blue-100 text-blue-700">Octubre 2026</Badge><h3 className="mt-3 text-2xl font-black">IVA crédito fiscal</h3><p className="text-sm text-muted-foreground">IVA pagado en compras computables durante el mes.</p></div><label className="text-sm font-bold">Período<select className="ml-3 h-9 rounded-md border bg-transparent px-3 font-normal"><option>Octubre 2026</option><option>Septiembre 2026</option><option>Agosto 2026</option></select></label></div><div className="grid gap-4 sm:grid-cols-3"><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-sm font-bold text-muted-foreground">IVA 21%</p><p className="mt-2 text-3xl font-black text-blue-700">{money(monthlyVat21)}</p><p className="mt-2 text-xs text-muted-foreground">Facturas y productos gravados al 21%</p></div><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-sm font-bold text-muted-foreground">IVA 10,5%</p><p className="mt-2 text-3xl font-black text-sky-600">{money(monthlyVat105)}</p><p className="mt-2 text-xs text-muted-foreground">Facturas y productos gravados al 10,5%</p></div><div className="rounded-3xl bg-[#3b2931] p-5 text-white shadow-sm"><p className="text-sm font-bold text-white/70">Crédito fiscal total</p><p className="mt-2 text-3xl font-black">{money(monthlyVat21 + monthlyVat105)}</p><p className="mt-2 text-xs text-white/60">Acumulado automático del período</p></div></div><div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b p-5"><h3 className="text-xl font-black">Detalle por comprobante</h3><p className="text-sm text-muted-foreground">Sólo se incluyen facturas de proveedores configurados con IVA.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Comprobante</TableHead><TableHead>Proveedor</TableHead><TableHead>Centro</TableHead><TableHead className="text-right">Neto gravado</TableHead><TableHead className="text-right">IVA 21%</TableHead><TableHead className="text-right">IVA 10,5%</TableHead><TableHead className="text-right">Crédito fiscal</TableHead></TableRow></TableHeader><TableBody>{purchases.filter(row=>row.tax!==0).map((row,index)=><TableRow key={index}><TableCell>{row.date}</TableCell><TableCell className="font-bold">{row.invoice}</TableCell><TableCell>{row.supplier}</TableCell><TableCell><Badge variant="outline">{row.center}</Badge></TableCell><TableCell className="text-right">{money(row.net)}</TableCell><TableCell className="text-right">{row.vat21 ? money(row.vat21) : "—"}</TableCell><TableCell className="text-right">{row.vat105 ? money(row.vat105) : "—"}</TableCell><TableCell className="text-right font-black text-blue-700">{money(row.tax)}</TableCell></TableRow>)}</TableBody></Table></div><div className="flex justify-between border-t bg-blue-50 px-5 py-4 font-black"><span>Total crédito fiscal del mes</span><span className="text-blue-700">{money(monthlyVat21 + monthlyVat105)}</span></div></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Importante:</b> los cálculos sirven para control interno. El crédito fiscal definitivo debe validarse con los comprobantes y la liquidación del contador.</div></div>}

      {tab === "pagos" && <div className="space-y-5"><div className="flex flex-col gap-4 rounded-3xl border bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-xl font-black">Pagos a proveedores</h3><p className="text-sm text-muted-foreground">Cada pago descuenta el saldo de la cuenta corriente seleccionada.</p></div><Button onClick={() => setPaymentOpen(true)} className="rounded-xl bg-[#3b2931] text-white"><Plus /> Registrar pago</Button></div><div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Proveedor</TableHead><TableHead>Forma de pago</TableHead><TableHead>Referencia</TableHead><TableHead>Observación</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader><TableBody>{payments.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Todavía no hay pagos registrados.</TableCell></TableRow>}{payments.map((row)=><TableRow key={row.id}><TableCell>{row.date}</TableCell><TableCell className="font-bold">{row.supplier}</TableCell><TableCell><Badge variant="outline">{row.method}</Badge></TableCell><TableCell>{row.reference}</TableCell><TableCell className="text-muted-foreground">{row.note}</TableCell><TableCell className="text-right font-black text-emerald-700">− {money(row.amount)}</TableCell></TableRow>)}</TableBody></Table></div></div>}

      {tab === "proveedores" && <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="text-xl font-black">Proveedores</h3><p className="text-sm text-muted-foreground">Perfiles, condición fiscal y cuenta corriente real.</p></div>
          <Button onClick={openNewSupplier} className="rounded-xl bg-[#3b2931] text-white"><Plus /> Nuevo proveedor</Button>
        </div>
        {supplierMessage && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{supplierMessage}</p>}
        {supplierError && !supplierOpen && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{supplierError}</p>}
        {suppliers.length === 0 && <div className="rounded-3xl border border-dashed bg-white p-10 text-center text-muted-foreground">Todavía no hay proveedores cargados.</div>}
        <div className="grid gap-5 lg:grid-cols-3">
          {suppliers.map((row) => <div key={row.id} className={`rounded-3xl border bg-white p-6 shadow-sm ${selectedSupplierName === row.name ? "ring-2 ring-[#c45c82]" : ""}`}>
            <div className="flex items-start justify-between">
              <div className="grid size-11 place-items-center rounded-2xl bg-[#f8dce7] font-black text-[#a53d67]">{row.name.slice(0,2).toUpperCase()}</div>
              <div className="flex flex-col items-end gap-2"><Badge variant="outline">{row.debt ? "Saldo pendiente" : "Sin deuda"}</Badge><Badge className={row.taxMode === "Con IVA" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"}>{row.taxMode}</Badge></div>
            </div>
            <h3 className="mt-5 text-xl font-black">{row.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{row.category || "Sin categoría"} · Última compra {row.date}</p>
            <div className="mt-5 border-t pt-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Saldo actual</p><p className={`mt-1 text-2xl font-black ${row.debt < 0 ? "text-emerald-700" : row.debt > 0 ? "text-rose-700" : ""}`}>{money(row.debt)}</p><p className="mt-1 text-xs text-muted-foreground">{row.debt > 0 ? "Münna debe al proveedor" : row.debt < 0 ? "Saldo a favor de Münna" : row.invoices}</p></div>
            <Button onClick={() => openSupplierProfile(row)} variant="ghost" className="mt-4 w-full justify-between">Ver perfil y cuenta <ChevronRight className="size-4"/></Button>
            <div className="mt-2 flex gap-2 border-t pt-3">
              <Button type="button" size="sm" variant="outline" onClick={() => openEditSupplier(row)} className="flex-1">Editar</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button type="button" size="sm" variant="ghost" disabled={archivingSupplierId === row.id} className="flex-1 text-rose-700 hover:bg-rose-50 hover:text-rose-800"><Archive className="size-4" /> {archivingSupplierId === row.id ? "Archivando…" : "Archivar"}</Button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Archivar {row.name}?</AlertDialogTitle><AlertDialogDescription>Dejará de aparecer en nuevas facturas y pagos. Sus compras, pagos y movimientos históricos se conservarán.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => archiveSupplier(row)} className="bg-rose-700 text-white hover:bg-rose-800">Archivar proveedor</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
              </AlertDialog>
            </div>
          </div>)}
        </div>
      </div>}

      {tab === "materias" && <div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-xl font-black">Insumos / Servicios</h3><p className="text-sm text-muted-foreground">Catálogo único para materias primas, servicios y demás gastos habituales.</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><div className="relative min-w-0 sm:w-80"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={materialQuery} onChange={(event) => setMaterialQuery(event.target.value)} placeholder="Buscar insumo, servicio o categoría" className="pl-9" /></div><Button onClick={openNewMaterial} className="rounded-xl bg-[#3b2931] text-white"><Plus /> Nuevo insumo o servicio</Button><Button variant="outline" onClick={() => setCategoriesOpen(true)}>Administrar categorías</Button></div></div>{materialMessage && <p className="mx-5 mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{materialMessage}</p>}{materialError && !materialOpen && <p className="mx-5 mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{materialError}</p>}<div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Tipo / categoría</TableHead><TableHead>Unidad</TableHead><TableHead>Contenido</TableHead><TableHead>IVA</TableHead><TableHead>Última compra</TableHead><TableHead className="text-right">Último costo</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader><TableBody>{filteredMaterials.length === 0 && <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">{materialQuery.trim() ? "No hay insumos o servicios que coincidan con la búsqueda." : "Todavía no hay insumos ni servicios cargados."}</TableCell></TableRow>}{filteredMaterials.map(row => <TableRow key={row.id ?? row.name}><TableCell className="font-bold">{row.name}</TableCell><TableCell><Badge className={(row.kind ?? "material") === "material" ? "bg-[#f8dce7] text-[#a53d67]" : (row.kind ?? "material") === "service" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"}>{categoryLabel(row.category ?? "Materia prima")}</Badge></TableCell><TableCell>{(row.kind ?? "material") === "material" ? row.unit === "unidad" ? "Unidad" : "Kilogramo" : "Servicio / gasto"}</TableCell><TableCell>{(row.kind ?? "material") === "material" ? row.pack : "—"}</TableCell><TableCell><Badge variant="outline">{String(row.vat).replace(".", ",")}%</Badge></TableCell><TableCell>{row.date}</TableCell><TableCell className="text-right font-black">{row.cost > 0 ? money(row.cost) : "Sin compras"}</TableCell><TableCell><div className="flex justify-end gap-2"><Button type="button" size="sm" variant="outline" onClick={() => openEditMaterial(row)}>Editar</Button><AlertDialog><AlertDialogTrigger asChild><Button type="button" size="sm" variant="ghost" disabled={archivingMaterial === row.name} className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"><Archive className="size-4" /> {archivingMaterial === row.name ? "Archivando…" : "Archivar"}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Archivar {row.name}?</AlertDialogTitle><AlertDialogDescription>Dejará de aparecer en nuevas facturas. Los movimientos históricos se conservarán.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => archiveMaterial(row)} className="bg-rose-700 text-white hover:bg-rose-800">Archivar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></TableCell></TableRow>)}</TableBody></Table></div></div>}

      {tab === "formulas" && <div className="space-y-4"><div className="rounded-3xl border bg-white p-6 shadow-sm"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><h3 className="text-xl font-black">Fórmulas de productos</h3><p className="text-sm text-muted-foreground">Cada fórmula obtiene 1 kg final. Activá desperdicio cuando el proceso necesite consumir más de 1 kg; los costos se actualizan automáticamente.</p></div><div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto"><div className="relative min-w-0 sm:w-80"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/><Input value={formulaQuery} onChange={(event) => setFormulaQuery(event.target.value)} placeholder="Buscar por nombre o código" className="pl-9" aria-label="Buscar fórmulas"/></div><Button onClick={() => openFormula()} disabled={(formulaMaterials.filter((item)=>item.id != null).length === 0 && (!formulaReferencesAvailable || formulas.length === 0))} className="rounded-xl bg-[#3b2931] text-white"><Plus /> Nueva fórmula</Button></div></div>{(formulaMaterials.filter((item)=>item.id != null).length === 0 && (!formulaReferencesAvailable || formulas.length === 0)) && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Primero cargá al menos una materia prima para poder crear fórmulas.</p>}</div>{formulas.length === 0 && <div className="rounded-3xl border border-dashed bg-white p-10 text-center text-muted-foreground">Todavía no hay fórmulas cargadas.</div>}{formulas.length > 0 && filteredFormulas.length === 0 && <div className="rounded-3xl border border-dashed bg-white p-10 text-center text-muted-foreground">No hay fórmulas que coincidan con “{formulaQuery.trim()}”.</div>}<div className="grid gap-4 lg:grid-cols-2">{filteredFormulas.map(row => <div key={row.id} className="rounded-3xl border bg-white p-6 shadow-sm"><div className="flex items-start justify-between"><div><div className="flex flex-wrap gap-2"><Badge variant="outline">Fórmula base · {row.batch}</Badge>{row.hasWaste && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Con desperdicio</Badge>}</div><h3 className="mt-3 text-xl font-black">{row.name}</h3><p className="mt-1 text-sm text-muted-foreground">{row.productCode || "Sin producto del maestro"} · {row.ingredients} ingredientes · actualizado {row.updated}</p></div><FlaskConical className="size-7 text-[#b74e76]"/></div>{row.hasWaste && <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-amber-50 p-4 text-center"><div><p className="text-xs text-amber-700">Cantidad utilizada</p><b>{row.inputQuantityKg.toLocaleString("es-AR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} kg</b></div><div><p className="text-xs text-amber-700">Rendimiento</p><b>{row.yieldPercent.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%</b></div><div><p className="text-xs text-amber-700">Desperdicio</p><b>{row.wasteKg.toLocaleString("es-AR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} kg</b></div></div>}<div className={`mt-6 grid gap-3 ${Number(row.packageWeightKg ?? 0) > 0 ? "sm:grid-cols-3" : "grid-cols-2"}`}><div className="rounded-2xl bg-[#fff3f7] p-4"><p className="text-xs font-semibold text-muted-foreground">Costo fórmula 1 kg</p><p className="mt-1 text-lg font-black">{money(row.recipe)}</p></div><div className="rounded-2xl bg-[#f5f3f4] p-4"><p className="text-xs font-semibold text-muted-foreground">Costo por kg</p><p className="mt-1 text-lg font-black">{money(row.perKg)}</p></div>{Number(row.packageWeightKg ?? 0) > 0 && <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-700">Costo presentación</p><p className="mt-1 text-lg font-black text-emerald-900">{money(Number(row.presentationCost ?? 0))}</p><p className="text-xs text-emerald-700">{Number(row.packageWeightKg).toLocaleString("es-AR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg</p></div>}</div><Button onClick={() => openFormula(row)} variant="ghost" className="mt-4 w-full justify-between">Abrir fórmula <ChevronRight className="size-4"/></Button></div>)}</div></div>}

      <Dialog open={supplierOpen} onOpenChange={(open) => { setSupplierOpen(open); if (!open) resetSupplierDraft(); }}><DialogContent className="sm:max-w-[620px]"><DialogHeader><DialogTitle>{editingSupplierId != null ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle><DialogDescription>{editingSupplierId != null ? "Los cambios se aplicarán al perfil sin perder facturas, pagos ni movimientos anteriores." : "El proveedor quedará disponible para facturas, pagos y cuenta corriente."}</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><label className="space-y-2 text-sm font-bold sm:col-span-2">Nombre o razón social<Input value={supplier.name} onChange={(e)=>setSupplier({...supplier,name:e.target.value})} placeholder="Ej. Vacalin"/></label><label className="space-y-2 text-sm font-bold">Condición de IVA<select value={supplier.taxMode} onChange={(e)=>setSupplier({...supplier,taxMode:e.target.value})} className="h-10 w-full rounded-md border bg-white px-3 font-normal"><option value="con_iva">Con IVA</option><option value="sin_iva">Sin IVA</option><option value="revisar">Revisar</option></select></label><label className="space-y-2 text-sm font-bold">Categoría<Input value={supplier.category} onChange={(e)=>setSupplier({...supplier,category:e.target.value})} placeholder="Ej. Materia prima"/></label></div>{supplierError && <p className="text-sm font-bold text-red-600">{supplierError}</p>}<DialogFooter><Button variant="outline" onClick={()=>{setSupplierOpen(false);resetSupplierDraft();}}>Cancelar</Button><Button disabled={savingSupplier} onClick={saveSupplier} className="bg-[#3b2931] text-white">{savingSupplier ? "Guardando…" : editingSupplierId != null ? "Guardar cambios" : "Guardar proveedor"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={adjustmentOpen} onOpenChange={(open) => { if (!savingAdjustment) setAdjustmentOpen(open); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Ajuste de cuenta · {selectedSupplier?.name}</DialogTitle>
            <DialogDescription>El ajuste modifica el saldo de la cuenta corriente del proveedor.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="space-y-1 text-sm font-bold">Fecha<Input type="date" value={adjustment.movementDate} onChange={(event) => setAdjustment({ ...adjustment, movementDate: event.target.value })}/></label>
            <label className="space-y-1 text-sm font-bold">Tipo de ajuste
              <select className="h-10 w-full rounded-md border bg-white px-3 font-normal" value={adjustment.direction} onChange={(event) => setAdjustment({ ...adjustment, direction: event.target.value })}>
                <option value="">Seleccionar</option>
                <option value="debit">Positivo (+) · aumenta el saldo</option>
                <option value="credit">Negativo (−) · reduce el saldo</option>
              </select>
            </label>
            <label className="space-y-1 text-sm font-bold">Importe<Input inputMode="decimal" value={adjustment.amount} onChange={(event) => setAdjustment({ ...adjustment, amount: event.target.value })}/></label>
            <label className="space-y-1 text-sm font-bold">Concepto<Input maxLength={250} value={adjustment.concept} onChange={(event) => setAdjustment({ ...adjustment, concept: event.target.value })}/></label>
            {adjustmentError && <p role="alert" className="text-sm text-red-600">{adjustmentError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={savingAdjustment} onClick={() => setAdjustmentOpen(false)}>Cancelar</Button>
            <Button disabled={savingAdjustment} onClick={saveSupplierAdjustment}>{savingAdjustment ? "Guardando…" : "Guardar ajuste"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={supplierProfileOpen} onOpenChange={setSupplierProfileOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[850px]">{selectedSupplier && <><DialogHeader><DialogTitle>Perfil de proveedor · {selectedSupplier.name}</DialogTitle><DialogDescription>Datos fiscales, saldo y movimientos de la cuenta corriente.</DialogDescription></DialogHeader><div className="flex justify-end"><Button variant="outline" onClick={() => { setAdjustment({ id: crypto.randomUUID(), movementDate: today, direction: "", concept: "", amount: "" }); setAdjustmentError(""); setAdjustmentOpen(true); }}>Agregar ajuste de cuenta</Button></div><div className="grid gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-[#fff3f7] p-4"><p className="text-xs font-bold uppercase text-muted-foreground">Condición fiscal</p><p className="mt-1 font-black">{selectedSupplier.taxMode}</p></div><div className="rounded-2xl bg-[#f5f3f4] p-4"><p className="text-xs font-bold uppercase text-muted-foreground">Categoría</p><p className="mt-1 font-black">{selectedSupplier.category || "Sin categoría"}</p></div><div className="rounded-2xl bg-[#fff8e8] p-4"><p className="text-xs font-bold uppercase text-muted-foreground">Facturas</p><p className="mt-1 font-black">{selectedSupplier.invoices}</p></div><div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-bold uppercase text-muted-foreground">Saldo actual</p><p className={`mt-1 font-black ${selectedSupplier.debt < 0 ? "text-emerald-700" : selectedSupplier.debt > 0 ? "text-rose-700" : ""}`}>{money(selectedSupplier.debt)}</p></div></div><div className="mt-2 overflow-hidden rounded-2xl border"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Movimiento</TableHead><TableHead className="text-right">Debe (+)</TableHead><TableHead className="text-right">Haber (−)</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader><TableBody>{supplierLedger.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Este proveedor todavía no tiene movimientos.</TableCell></TableRow>}{supplierLedger.map((row,index)=><TableRow key={`${row.dateKey}-${index}`}><TableCell>{row.date}</TableCell><TableCell className="font-medium">{row.detail}</TableCell><TableCell className="text-right text-rose-700">{row.debit ? money(row.debit) : "—"}</TableCell><TableCell className="text-right text-emerald-700">{row.credit ? money(row.credit) : "—"}</TableCell><TableCell className={`text-right font-black ${row.balance < 0 ? "text-emerald-700" : row.balance > 0 ? "text-rose-700" : ""}`}>{money(row.balance)}</TableCell></TableRow>)}</TableBody></Table><div className="border-t bg-[#faf7f8] px-5 py-3 text-xs text-muted-foreground">Saldo positivo: Münna debe al proveedor · Saldo negativo: queda dinero a favor de Münna.</div></div><DialogFooter><Button variant="outline" onClick={() => setSupplierProfileOpen(false)}>Cerrar</Button><Button onClick={() => openEditSupplier(selectedSupplier)} className="bg-[#3b2931] text-white">Editar proveedor</Button></DialogFooter></>}</DialogContent></Dialog>

      <Dialog open={formulaOpen} onOpenChange={setFormulaOpen}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[820px]"><DialogHeader><DialogTitle>{formula.id ? "Editar fórmula" : "Nueva fórmula"}</DialogTitle><DialogDescription>La fórmula siempre obtiene 1 kg final. Sin desperdicio, los ingredientes deben sumar 1 kg; con desperdicio, pueden superar 1 kg.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-3"><label className="space-y-2 text-sm font-bold sm:col-span-3">Nombre de la fórmula<Input value={formula.name} onChange={(e)=>setFormula({...formula,name:e.target.value})} placeholder="Ej. Base Americana o Granizado"/></label><div className="flex items-start justify-between gap-4 rounded-2xl border bg-amber-50 p-4 sm:col-span-3"><div><p className="font-bold">Tiene desperdicio</p><p className="text-xs text-muted-foreground">Permite consumir más de 1 kg de ingredientes para obtener 1 kg final. Sólo modifica el costeo; no mueve stock.</p></div><Switch checked={formula.hasWaste} onCheckedChange={(checked)=>setFormula({...formula,hasWaste:checked})} aria-label="Tiene desperdicio"/></div><label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" checked={Boolean(formula.productCode)} onChange={(e)=>setFormula({...formula,productCode:e.target.checked ? activeProductCatalog()[0]?.code ?? "" : ""})}/>Vincular a un producto del maestro (opcional)</label>{formula.productCode && <label className="space-y-2 text-sm font-bold sm:col-span-3">Producto del maestro<Combobox items={productionProducts()} filter={comboboxWordFilter} autoHighlight value={formula.productCode ? productionProducts().find((item) => item.startsWith(`${formula.productCode} · `)) ?? null : null} onValueChange={(value) => { if (typeof value !== "string" || !value) return; const selectedCode = value.split(" · ")[0].trim(); const selectedProduct = activeProductCatalog().find((item) => String(item.code) === selectedCode); if (selectedProduct) setFormula((current) => ({...current,productCode:String(selectedProduct.code),name:current.name || selectedProduct.name})); }}><ComboboxInput placeholder="Escribí el nombre o código del producto…" className="h-11 w-full rounded-xl bg-white font-normal"/><ComboboxContent><ComboboxEmpty>No encontramos ese producto en el maestro.</ComboboxEmpty><ComboboxList>{(item) => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>}</ComboboxList></ComboboxContent></Combobox><span className="block text-xs font-normal text-muted-foreground">La fórmula queda vinculada a este producto del maestro.</span></label>}<div className={`rounded-2xl border-2 p-4 ${formulaIsValid ? "border-emerald-500 bg-emerald-50" : "border-amber-400 bg-amber-50"}`}><p className="text-xs font-bold uppercase text-muted-foreground">Cantidad utilizada</p><p className="mt-1 text-2xl font-black">{formulaQuantityTotal.toLocaleString("es-AR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} kg → 1,0000 kg final</p><p className={`mt-1 text-xs font-bold ${formulaIsValid ? "text-emerald-700" : "text-amber-800"}`}>{formulaIsValid ? formula.hasWaste ? `Rendimiento ${formulaYieldPercent.toLocaleString("es-AR", { maximumFractionDigits: 1 })}% · desperdicio ${formulaWasteKg.toLocaleString("es-AR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} kg` : "Exacto: ya se puede guardar" : formula.hasWaste ? "Con desperdicio, la cantidad utilizada debe superar 1,0000 kg" : formulaDifference > 0 ? `Faltan ${formulaDifference.toLocaleString("es-AR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} kg` : `Sobran ${Math.abs(formulaDifference).toLocaleString("es-AR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} kg`}</p></div><div className="rounded-2xl bg-[#fff3f7] p-4 sm:col-span-2"><p className="text-xs font-bold uppercase text-muted-foreground">Costo calculado</p><div className="mt-2 flex flex-wrap gap-6"><div><b className="text-lg">{money(formulaCost)}</b><p className="text-xs text-muted-foreground">Costo de todos los insumos por 1 kg final</p></div>{formulaPresentationCost != null && <div><b className="text-lg">{money(formulaPresentationCost)}</b><p className="text-xs text-muted-foreground">Presentación de {Number(selectedFormulaProfile?.packageWeightKg).toLocaleString("es-AR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg</p></div>}</div></div></div>{selectedFormulaCatalogProduct && selectedFormulaCatalogProduct.family !== "Helado" && Number(selectedFormulaProfile?.packageWeightKg ?? 0) <= 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Para calcular el costo de la presentación, completá su peso neto en Maestro de productos.</p>}<div className="space-y-3"><div className="flex items-center justify-between"><h4 className="font-black">Ingredientes consumidos para obtener 1 kg</h4><Button type="button" variant="outline" size="sm" onClick={()=>setFormula({...formula,items:[...formula.items,{materialId:formulaMaterials[0]?.id ? String(formulaMaterials[0].id) : "",quantityKg:""}]})}><Plus /> Agregar ingrediente</Button></div>{formula.items.map((item,index)=>{ const selectedMaterial=materials.find(row=>String(row.id)===item.materialId); const selectedBaseFormula=formulas.find(row=>String(row.id)===item.recipeId); const unitCost=ingredientUnitCost(item); const quantity=Number(item.quantityKg.replace(",","."))||0; return <div key={index} className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-[2fr_1fr_1fr_auto]"><div className="space-y-3"><label className="block space-y-1 text-xs font-bold">Tipo de ingrediente<select value={item.ingredientType ?? (item.recipeId ? "recipe" : "material")} onChange={(e)=>{const ingredientType=e.target.value as "material" | "recipe";setFormula({...formula,items:formula.items.map((row,i)=>i===index?{...row,ingredientType,materialId:"",recipeId:ingredientType === "recipe" ? "" : undefined}:row)});}} className="h-10 w-full rounded-md border bg-white px-3 text-sm font-normal"><option value="material">Materia prima</option><option value="recipe" disabled={!formulaReferencesAvailable}>Producto</option></select></label>{(item.ingredientType ?? (item.recipeId ? "recipe" : "material")) === "recipe" ? <label className="block space-y-1 text-xs font-bold">Fórmula del producto<Combobox items={availableBaseFormulas.map(row=>String(row.id))} value={item.recipeId || null} itemToStringLabel={(id)=>availableBaseFormulas.find(row=>String(row.id)===id)?.name ?? ""} filter={(id,query)=>comboboxWordFilter(availableBaseFormulas.find(row=>String(row.id)===id)?.name ?? "",query)} autoHighlight onValueChange={(value)=>setFormula((current)=>({...current,items:current.items.map((row,i)=>i===index?{...row,recipeId:value ?? "",materialId:""}:row)}))}><ComboboxInput aria-label="Buscar fórmula" placeholder="Escribí para buscar fórmula…" onFocus={(event)=>event.target.select()} className="h-10 w-full bg-white text-sm font-normal"/><ComboboxContent><ComboboxEmpty>No encontramos esa fórmula.</ComboboxEmpty><ComboboxList>{(id)=><ComboboxItem key={id} value={id}>{availableBaseFormulas.find(row=>String(row.id)===id)?.name}</ComboboxItem>}</ComboboxList></ComboboxContent></Combobox><span className="block font-normal text-muted-foreground">Incluye fórmulas con o sin producto del maestro.</span></label> : <label className="block space-y-1 text-xs font-bold">Materia prima<Combobox items={formulaMaterials.filter(row=>row.id != null).map(row=>String(row.id))} value={item.materialId || null} itemToStringLabel={(id)=>formulaMaterials.find(row=>String(row.id)===id)?.name ?? ""} filter={(id,query)=>comboboxWordFilter(formulaMaterials.find(row=>String(row.id)===id)?.name ?? "",query)} autoHighlight onValueChange={(value)=>setFormula((current)=>({...current,items:current.items.map((row,i)=>i===index?{...row,materialId:value ?? "",recipeId:undefined}:row)}))}><ComboboxInput aria-label="Buscar materia prima" placeholder="Escribí para buscar materia prima…" onFocus={(event)=>event.target.select()} className="h-10 w-full bg-white text-sm font-normal"/><ComboboxContent><ComboboxEmpty>No encontramos esa materia prima.</ComboboxEmpty><ComboboxList>{(id)=><ComboboxItem key={id} value={id}>{formulaMaterials.find(row=>String(row.id)===id)?.name}</ComboboxItem>}</ComboboxList></ComboboxContent></Combobox></label>}<span className="block text-xs font-normal text-muted-foreground">{selectedBaseFormula ? `Fórmula vinculada: ${invoiceMoney(unitCost)} por kg. Se actualiza con la fórmula base.` : selectedMaterial ? `Precio tomado: ${invoiceMoney(unitCost)} por kg` : "Seleccioná un ingrediente para ver el precio por kg"}</span></div><label className="space-y-1 text-xs font-bold">Cantidad en kg<Input value={item.quantityKg} onChange={(e)=>setFormula({...formula,items:formula.items.map((row,i)=>i===index?{...row,quantityKg:e.target.value}:row)})} inputMode="decimal" placeholder="0,0000"/><span className="block font-normal text-muted-foreground">{formula.hasWaste ? "kg utilizados antes del desperdicio" : "kg dentro de 1 kg final"}</span></label><div className="self-end rounded-xl bg-[#f7f3f5] px-3 py-2 text-right"><p className="text-xs text-muted-foreground">Costo</p><b>{money(quantity * unitCost)}</b></div><Button type="button" variant="ghost" className="self-end text-muted-foreground" disabled={formula.items.length===1} onClick={()=>setFormula({...formula,items:formula.items.filter((_,i)=>i!==index)})}>Quitar</Button></div>})}</div>{formulaError && <p className="text-sm font-bold text-red-600">{formulaError}</p>}<DialogFooter><Button variant="outline" onClick={()=>setFormulaOpen(false)}>Cancelar</Button><Button disabled={savingFormula || !formulaIsValid} onClick={saveFormula} className="bg-[#3b2931] text-white">{savingFormula ? "Guardando…" : "Guardar fórmula"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={categoriesOpen} onOpenChange={setCategoriesOpen}><DialogContent className="sm:max-w-[600px]"><DialogHeader><DialogTitle>Administrar categorías de gasto</DialogTitle><DialogDescription>Creá categorías o cambiá sus nombres. Los gastos e insumos existentes conservarán su categoría.</DialogDescription></DialogHeader><div className="max-h-64 space-y-2 overflow-y-auto">{categoryRows.map(row => <div key={row.key} className="flex items-center justify-between gap-3 rounded-lg border p-3"><span>{row.name}</span><Button variant="outline" size="sm" disabled={savingCategory} onClick={() => {setCategoryDraft(row);setCategoryError("");}}>Editar</Button></div>)}</div><label className="space-y-2 text-sm font-bold">{categoryDraft.key ? "Nuevo nombre" : "Nueva categoría"}<Input value={categoryDraft.name} maxLength={80} placeholder="Ej. Publicidad" disabled={savingCategory} onChange={event => setCategoryDraft({...categoryDraft,name:event.target.value})}/></label>{categoryError && <p role="alert" className="text-sm text-red-700">{categoryError}</p>}<DialogFooter>{categoryDraft.key && <Button variant="outline" disabled={savingCategory} onClick={() => setCategoryDraft({key:"",name:""})}>Cancelar edición</Button>}<Button variant="outline" onClick={() => setCategoriesOpen(false)}>Cerrar</Button><Button disabled={savingCategory || !categoryDraft.name.trim()} onClick={saveCategory}>{savingCategory ? "Guardando…" : categoryDraft.key ? "Guardar nombre" : "Agregar categoría"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={materialOpen} onOpenChange={(open) => { setMaterialOpen(open); if (!open) resetMaterialDraft(); }}><DialogContent className="sm:max-w-[650px]"><DialogHeader><DialogTitle>{editingMaterialName ? "Editar insumo o servicio" : "Nuevo insumo o servicio"}</DialogTitle><DialogDescription>Crealo una sola vez para reutilizarlo al cargar facturas. Solamente las materias primas estarán disponibles en las fórmulas.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><label className="space-y-2 text-sm font-bold sm:col-span-2">Nombre<Input value={material.name} onChange={(e)=>setMaterial({...material,name:e.target.value})} placeholder={material.kind === "material" ? "Ej. Pasta de pistacho" : "Ej. Energía eléctrica"}/></label><label className="space-y-2 text-sm font-bold sm:col-span-2">Tipo / categoría<select value={material.kind === "material" ? "material" : material.category} onChange={(e)=>{ const value=e.target.value; setMaterial({...material,kind:value==="material"?"material":value==="Servicios"?"service":"expense",category:value==="material"?"Materia prima":value,unit:value==="material"?"kg":"unidad",contentPerPackage:"1"}); }} className="h-10 w-full rounded-md border bg-white px-3 font-normal"><option value="material">Materia prima</option>{expenseCategoryRows.map(row => <option key={row.key} value={row.key}>{row.name}</option>)}</select></label>{material.kind === "material" && <><label className="space-y-2 text-sm font-bold">Unidad de costo<select value={material.unit} onChange={(e)=>setMaterial({...material,unit:e.target.value})} className="h-10 w-full rounded-md border bg-white px-3 font-normal"><option value="kg">Kilogramo</option><option value="unidad">Unidad</option></select></label><label className="space-y-2 text-sm font-bold">Contenido por envase<Input value={material.contentPerPackage} onChange={(e)=>setMaterial({...material,contentPerPackage:e.target.value})} inputMode="decimal" placeholder="Ej. 10"/><span className="block text-xs font-normal text-muted-foreground">Cuántos kg o unidades trae cada envase.</span></label></>}<label className="space-y-2 text-sm font-bold sm:col-span-2">IVA habitual<select value={material.vat} onChange={(e)=>setMaterial({...material,vat:e.target.value})} className="h-10 w-full rounded-md border bg-white px-3 font-normal"><option value="21">21%</option><option value="10.5">10,5%</option><option value="0">0%</option></select></label></div>{materialError && <p className="text-sm font-bold text-red-600">{materialError}</p>}<DialogFooter><Button variant="outline" onClick={()=>{setMaterialOpen(false);resetMaterialDraft();}}>Cancelar</Button><Button disabled={savingMaterial} onClick={saveMaterial} className="bg-[#3b2931] text-white">{savingMaterial ? "Guardando…" : editingMaterialName ? "Guardar cambios" : "Guardar en catálogo"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[650px]"><DialogHeader><DialogTitle>{isPayroll ? "Registrar costo laboral" : "Registrar gasto general"}</DialogTitle><DialogDescription>{isPayroll ? "Sin proveedor ni factura. El costo se asigna al período trabajado; marcarlo pagado no genera otro gasto." : "Este gasto se incorporará automáticamente al Estado de resultados del área seleccionada."}</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-bold">Tipo de costo<select value={isPayroll ? "laboral" : "general"} onChange={e=>setExpense({...expense,category:e.target.value === "laboral" ? "Sueldos" : "Servicios"})} className="h-10 w-full rounded-md border bg-white px-3 font-normal"><option value="general">Gasto general</option><option value="laboral">Sueldos y costos laborales</option></select></label>
          <label className="space-y-2 text-sm font-bold">Destino<select value={expense.area} onChange={(e) => setExpense({...expense,area:e.target.value})} className="h-10 w-full rounded-md border bg-white px-3 font-normal">{invoiceCostCenters.map(x=><option key={x}>{x}</option>)}</select><span className="block text-xs font-normal text-muted-foreground">Administración, Logística y demás conceptos se definen en Categoría.</span></label>
          <label className="space-y-2 text-sm font-bold">Categoría<select value={expense.category} onChange={(e)=>setExpense({...expense,category:e.target.value})} className="h-10 w-full rounded-md border bg-white px-3 font-normal">{expenseCategories.filter(x=>isPayroll === ["Sueldos","Cargas sociales","Otros costos laborales"].includes(x)).map(x=><option key={x} value={x}>{categoryLabel(x)}</option>)}</select></label>
          <label className="space-y-2 text-sm font-bold">Importe<Input value={expense.amount} onChange={(e)=>setExpense({...expense,amount:e.target.value})} inputMode="numeric" placeholder="$ 0"/></label>
          {isPayroll ? <>
            <label className="space-y-2 text-sm font-bold sm:col-span-2">Empleado o equipo<Input value={expense.employee} onChange={e=>setExpense({...expense,employee:e.target.value})} placeholder="Ej. Juan Pérez o Equipo de fábrica"/></label>
            <label className="space-y-2 text-sm font-bold">Período trabajado<Input type="month" value={expense.payrollPeriod} onChange={e=>setExpense({...expense,payrollPeriod:e.target.value})}/></label>
            <label className="space-y-2 text-sm font-bold">Estado de pago<select value={expense.paymentStatus} onChange={e=>setExpense({...expense,paymentStatus:e.target.value})} className="h-10 w-full rounded-md border bg-white px-3 font-normal"><option>Pendiente</option><option>Pagado</option></select></label>
          </> : <>
            <label className="space-y-2 text-sm font-bold">Fecha<Input type="date" value={expense.expenseDate} onChange={(e) => setExpense({...expense,expenseDate:e.target.value})}/></label>
            <label className="space-y-2 text-sm font-bold sm:col-span-2">Concepto<Input value={expense.concept} onChange={(e)=>setExpense({...expense,concept:e.target.value})} placeholder="Ej. Factura de luz octubre"/></label>
          </>}
          <label className="space-y-2 text-sm font-bold sm:col-span-2">Observaciones<Textarea value={expense.notes} onChange={(e)=>setExpense({...expense,notes:e.target.value})} placeholder="Detalle adicional"/></label>
        </div>{expenseError && <p role="alert" className="text-sm font-bold text-red-600">{expenseError}</p>}<DialogFooter><Button variant="outline" onClick={()=>setExpenseOpen(false)}>Cancelar</Button><Button disabled={savingExpense} onClick={saveExpense} className="bg-[#3b2931] text-white">{savingExpense ? "Guardando…" : isPayroll ? "Guardar costo laboral" : "Guardar gasto"}</Button></DialogFooter></DialogContent></Dialog>


      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}><DialogContent className="sm:max-w-[620px]"><DialogHeader><DialogTitle>Registrar pago a proveedor</DialogTitle><DialogDescription>El importe se descuenta de la cuenta corriente del proveedor.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><label className="space-y-2 text-sm font-bold">Proveedor<select value={payment.supplier} onChange={e=>setPayment({...payment,supplier:e.target.value})} className="h-9 w-full rounded-md border bg-transparent px-3 font-normal">{suppliers.map(item=><option key={item.name}>{item.name}</option>)}</select></label><label className="space-y-2 text-sm font-bold">Fecha<Input type="date" value={payment.paymentDate} onChange={(e)=>setPayment({...payment,paymentDate:e.target.value})}/></label><label className="space-y-2 text-sm font-bold">Monto pagado<Input value={payment.amount} onChange={e=>setPayment({...payment,amount:e.target.value})} inputMode="numeric" placeholder="$ 0"/></label><label className="space-y-2 text-sm font-bold">Forma de pago<select value={payment.method} onChange={e=>setPayment({...payment,method:e.target.value})} className="h-9 w-full rounded-md border bg-transparent px-3 font-normal">{["Transferencia","Efectivo","Echeq","Cheque de tercero","Mercadería"].map(item=><option key={item}>{item}</option>)}</select></label><label className="space-y-2 text-sm font-bold sm:col-span-2">Referencia o comprobante<Input value={payment.reference} onChange={e=>setPayment({...payment,reference:e.target.value})} placeholder="N.º de transferencia, cheque o recibo"/></label><label className="space-y-2 text-sm font-bold sm:col-span-2">Observaciones<Textarea value={payment.note} onChange={e=>setPayment({...payment,note:e.target.value})} placeholder="Ej. Pago parcial, vencimiento del echeq o detalle de la mercadería entregada"/></label></div><div className="rounded-2xl bg-[#f7f3f5] p-4 text-sm"><div className="flex justify-between"><span>Saldo actual del proveedor</span><b>{money(suppliers.find(item=>item.name===payment.supplier)?.debt ?? 0)}</b></div><div className="mt-2 flex justify-between border-t pt-2"><span>Saldo después del pago</span><b>{money((suppliers.find(item=>item.name===payment.supplier)?.debt ?? 0) - (Number(payment.amount.replace(/\D/g,"")) || 0))}</b></div></div>{paymentError && <p className="text-sm font-bold text-red-600">{paymentError}</p>}<DialogFooter><Button variant="outline" onClick={()=>setPaymentOpen(false)}>Cancelar</Button><Button disabled={savingPayment} onClick={savePayment} className="bg-[#3b2931] text-white">{savingPayment ? "Guardando…" : "Registrar pago"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={purchaseDetailOpen} onOpenChange={setPurchaseDetailOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[900px]"><DialogHeader><DialogTitle>{selectedPurchase?.documentType === "credit_note" ? "Nota de crédito" : "Factura"} {selectedPurchase?.invoice}</DialogTitle><DialogDescription>Detalle completo del comprobante y su imputación contable.</DialogDescription></DialogHeader>
        {selectedPurchase && <div className="space-y-5">
          <div className="grid gap-3 rounded-2xl border bg-[#fff7fa] p-4 sm:grid-cols-2 lg:grid-cols-5"><div><p className="text-xs font-bold uppercase text-muted-foreground">Proveedor</p><p className="font-black">{selectedPurchase.supplier}</p></div><div><p className="text-xs font-bold uppercase text-muted-foreground">Fecha</p><p className="font-black">{selectedPurchase.date}</p></div><div><p className="text-xs font-bold uppercase text-muted-foreground">Vencimiento</p><p className="font-black">{selectedPurchase.dueDateDisplay ?? "Sin vencimiento"}</p></div><div><p className="text-xs font-bold uppercase text-muted-foreground">Destino</p><Badge variant="outline" className="mt-1">{selectedPurchase.center}</Badge></div><div><p className="text-xs font-bold uppercase text-muted-foreground">Condición</p><p className="font-black">{selectedPurchase.status}</p></div></div>
          <div className="overflow-hidden rounded-2xl border"><Table><TableHeader><TableRow><TableHead>Tipo / detalle</TableHead><TableHead>Destino</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Precio neto unit.</TableHead><TableHead className="text-right">IVA</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>{(selectedPurchase.lines ?? []).map((line) => <TableRow key={line.id}><TableCell><div className="font-bold">{line.product}</div><div className="text-xs text-muted-foreground">{line.kind === "material" ? "Materia prima" : line.kind === "service" ? "Servicio" : "Otro gasto"} · {categoryLabel(line.category)}</div></TableCell><TableCell><Badge variant="outline">{line.center}</Badge></TableCell><TableCell className="text-right">{line.quantity.toLocaleString("es-AR")}</TableCell><TableCell className="text-right">{invoiceMoney(line.unitNet)}</TableCell><TableCell className="text-right">{invoiceMoney(line.vatAmount)}</TableCell><TableCell className="text-right font-black">{invoiceMoney(line.total)}</TableCell></TableRow>)}{!selectedPurchase.lines?.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Esta factura anterior no tiene el detalle de renglones disponible.</TableCell></TableRow>}</TableBody></Table></div>
          <div className="ml-auto w-full max-w-sm space-y-2 rounded-2xl bg-[#f7f3f5] p-4 text-sm"><div className="flex justify-between"><span>Neto</span><b>{invoiceMoney(selectedPurchase.net)}</b></div><div className="flex justify-between"><span>IVA</span><b>{invoiceMoney(selectedPurchase.tax)}</b></div><div className="flex justify-between border-t pt-3 text-lg"><span>Total</span><b>{invoiceMoney(selectedPurchase.total)}</b></div></div>
        </div>}
        {purchaseActionError && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{purchaseActionError}</p>}
        <DialogFooter className="gap-2 sm:justify-between"><AlertDialog><AlertDialogTrigger asChild><Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50"><Trash2 className="size-4"/> Eliminar</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Eliminar este comprobante?</AlertDialogTitle><AlertDialogDescription>Se quitará de la cuenta corriente, IVA, análisis de gastos y costos. Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={deletingPurchase} onClick={() => selectedPurchase && deletePurchase(selectedPurchase)} className="bg-red-600 text-white hover:bg-red-700">{deletingPurchase ? "Eliminando…" : "Sí, eliminar comprobante"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><div className="flex gap-2"><Button variant="outline" onClick={() => setPurchaseDetailOpen(false)}>Cerrar</Button><Button onClick={() => selectedPurchase && editPurchase(selectedPurchase)} className="bg-[#3b2931] text-white"><Pencil className="size-4"/> Editar comprobante</Button></div></DialogFooter>
      </DialogContent></Dialog>

      <AlertDialog open={discardPurchaseOpen} onOpenChange={setDiscardPurchaseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Querés salir sin guardar?</AlertDialogTitle>
            <AlertDialogDescription>Tenés información cargada que se perderá si cerrás esta ventana.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir cargando</AlertDialogCancel>
            <AlertDialogAction onClick={closePurchase}>Salir sin guardar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={purchaseOpen} onOpenChange={(open) => { if (!open) requestPurchaseClose(); }}><DialogContent onInteractOutside={(event) => event.preventDefault()} className="max-h-[92vh] overflow-y-auto sm:max-w-[1080px]"><DialogHeader><DialogTitle>{isCreditNote ? editingPurchaseId != null ? "Editar nota de crédito" : "Crear nota de crédito" : editingPurchaseId != null ? "Editar factura" : "Cargar factura de compra o gasto"}</DialogTitle><DialogDescription>{isCreditNote ? "Cargá las cantidades y precios positivos de los productos devueltos. Se descontarán del gasto y del saldo del proveedor; si corresponde, quedará saldo a favor." : editingPurchaseId != null ? "Corregí los datos o renglones necesarios. Los saldos y costos se recalcularán al guardar." : "Una sola factura para materias primas, servicios y otros gastos. Cada renglón puede tener un destino diferente."}</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-2 text-sm font-bold lg:col-span-2">Proveedor<select value={purchase.supplier} onChange={e => { const supplierName=e.target.value; const supplierProfile=suppliers.find((item)=>item.name===supplierName); const priceMode=defaultInvoicePriceMode(supplierProfile?.taxMode ?? "Revisar"); setPurchase({...purchase,supplier:supplierName}); setInvoiceLines((lines)=>lines.map((line)=>({...line,priceMode}))); }} className="h-9 w-full rounded-md border bg-transparent px-3 font-normal"><option value="">Seleccionar…</option>{suppliers.map(x=><option key={x.name}>{x.name}</option>)}</select></label>
          <label className="space-y-2 text-sm font-bold">Fecha<Input type="date" value={purchase.invoiceDate} onChange={(e)=>setPurchase({...purchase,invoiceDate:e.target.value})}/></label>
          <label className="space-y-2 text-sm font-bold">{isCreditNote ? "N.º de nota de crédito" : "N.º de factura"}<Input value={purchase.invoice} onChange={e => setPurchase({...purchase, invoice:e.target.value})} placeholder={isCreditNote ? "NC A 0001-00001" : "FC A 0001-00001"}/></label>
          <label className="space-y-2 text-sm font-bold">Fecha de vencimiento <span className="font-normal text-muted-foreground">(opcional)</span><Input type="date" disabled={isCreditNote} value={isCreditNote ? "" : purchase.dueDate} onChange={(e)=>setPurchase({...purchase,dueDate:e.target.value})}/></label>
          <div className="rounded-2xl border bg-[#fff7fa] p-4 sm:col-span-2 lg:col-span-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase text-muted-foreground">Cuenta del proveedor</p><p className="font-black">{activeSupplier.name || "Seleccioná un proveedor"}</p></div><Badge className={activeSupplier.taxMode === "Con IVA" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"}>{activeSupplier.taxMode}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{isCreditNote ? "La nota de crédito resta el gasto, el IVA y la deuda del proveedor. Elegí el mismo destino de la compra que se devuelve." : "La factura alimenta la cuenta corriente y el crédito fiscal. La categoría se completa desde el catálogo y el destino se define por renglón."}</p></div>
        </div>
        <div className="space-y-3"><div className="flex items-center justify-between"><h4 className="font-black">{isCreditNote ? "Productos devueltos" : "Detalle de la factura"}</h4><Button variant="outline" size="sm" disabled={!purchase.supplier} onClick={() => setInvoiceLines(lines => [...lines, createInvoiceLine(defaultInvoicePriceMode(activeSupplier.taxMode))])}><Plus /> Agregar renglón</Button></div>
          {invoiceLines.map((line, index) => { const profile = materials.find(item => item.name === line.product); const amounts = calculateInvoiceLine(line, Number(profile?.vat ?? line.vatRate ?? 21)); return <div key={index} className="space-y-3 rounded-2xl border bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-bold">Insumo / servicio<Input list={`purchase-products-${index}`} value={line.product} onChange={e => { const selected=materials.find((item)=>item.name===e.target.value); setInvoiceLines(lines => lines.map((item, i) => i === index ? {...item,product:e.target.value,...(selected?{kind:selected.kind??"material",category:selected.category??"Materia prima",vatRate:String(selected.vat)}:{})} : item)); }} disabled={!purchase.supplier} placeholder="Escribí para buscar en el catálogo…"/><datalist id={`purchase-products-${index}`}>{materials.map(item=><option key={item.id ?? item.name} value={item.name}/>)}</datalist><span className="block font-normal text-muted-foreground">{profile ? <><Badge variant="outline" className="mr-2 text-[10px]">{categoryLabel(profile.category ?? "Materia prima")}</Badge>{profile.kind === "material" ? `${profile.pack} · IVA ${String(profile.vat).replace(".", ",")}%` : `IVA ${String(profile.vat).replace(".", ",")}%`}</> : "Seleccioná un elemento del catálogo de Insumos / Servicios."}</span></label>
              <label className="space-y-1 text-xs font-bold">Destino<select value={line.center} onChange={(e)=>setInvoiceLines(lines=>lines.map((item,i)=>i===index?{...item,center:e.target.value}:item))} className="h-10 w-full rounded-md border bg-white px-3 text-sm font-normal"><option value="">Seleccionar</option>{invoiceCostCenters.map(center=><option key={center}>{center}</option>)}</select><span className="block font-normal text-muted-foreground">Indicá si corresponde a Fábrica o Av. de Mayo.</span></label>
            </div>
            <div className="grid gap-3 lg:grid-cols-[.7fr_1fr_1.5fr_auto]">
              <label className="space-y-1 text-xs font-bold">Cantidad<Input value={line.quantity} onChange={e => setInvoiceLines(lines => lines.map((item, i) => i === index ? {...item, quantity:e.target.value} : item))} inputMode="decimal"/></label>
              <label className="space-y-1 text-xs font-bold">Precio por unidad<Input value={line.price} onChange={e => setInvoiceLines(lines => lines.map((item, i) => i === index ? {...item, price:e.target.value} : item))} placeholder="$ 0" inputMode="decimal"/><span className="block text-right font-normal text-muted-foreground">Ingresado {invoiceMoney(parseInvoiceAmount(line.price))}</span></label>
              <div className="space-y-1"><p className="text-xs font-bold">Tratamiento del IVA</p><div className="grid grid-cols-3 overflow-hidden rounded-lg border bg-white" role="group" aria-label="Tratamiento del IVA">{([{value:"included",label:"IVA incluido"},{value:"excluded",label:"IVA no incluido"},{value:"black",label:"N"}] as const).map((option)=><button key={option.value} type="button" onClick={()=>setInvoiceLines(lines=>lines.map((item,i)=>i===index?{...item,priceMode:option.value}:item))} className={`min-h-9 border-r px-2 py-1 text-[10px] font-bold leading-tight last:border-r-0 ${line.priceMode===option.value?"bg-[#3b2931] text-white":"hover:bg-[#f7f3f5]"}`}>{option.label}</button>)}</div><span className="block text-right text-[11px] text-muted-foreground">Neto {invoiceMoney(amounts.net)} · IVA {invoiceMoney(amounts.vat)}<br/><b>Total {invoiceMoney(amounts.gross)}</b></span></div>
              <Button variant="ghost" className="self-center text-muted-foreground" disabled={invoiceLines.length === 1} onClick={() => setInvoiceLines(lines => lines.filter((_, i) => i !== index))}>Quitar</Button>
            </div>
          </div>})}
        </div>
        <div className="mt-2 grid gap-4 sm:grid-cols-2"><div className="rounded-xl border bg-slate-50 p-3 text-xs text-muted-foreground"><b className="text-foreground">Compras repartidas:</b> repetí la materia prima en otro renglón, indicá la cantidad correspondiente y elegí otro destino.</div><label className="space-y-2 text-sm font-bold">Condición de pago<select disabled={isCreditNote} value={isCreditNote ? "Cuenta corriente" : purchase.payment} onChange={e => setPurchase({...purchase, payment:e.target.value})} className="h-10 w-full rounded-md border bg-white px-3 font-normal"><option value="">Seleccionar</option><option>Pagado</option><option>Cuenta corriente</option></select></label></div>
        <div className="ml-auto mt-3 w-full max-w-sm space-y-2 rounded-2xl bg-[#f7f3f5] p-4 text-sm"><div className="flex justify-between"><span>Neto</span><b>{invoiceMoney(invoiceNet)}</b></div>{invoiceVat21 > 0 && <div className="flex justify-between text-xs"><span>IVA 21% · crédito fiscal</span><b>{invoiceMoney(invoiceVat21)}</b></div>}{invoiceVat105 > 0 && <div className="flex justify-between text-xs"><span>IVA 10,5% · crédito fiscal</span><b>{invoiceMoney(invoiceVat105)}</b></div>}<div className="flex justify-between"><span>IVA automático total</span><b>{invoiceMoney(invoiceTax)}</b></div><div className="flex justify-between border-t pt-3 text-lg"><span>{isCreditNote ? "Total a descontar" : "Total factura"}</span><b>{invoiceMoney(invoiceGross)}</b></div>{(isCreditNote || purchase.payment === "Cuenta corriente") && <p className="text-xs text-amber-700">{isCreditNote ? "Se descontará de la deuda. El excedente quedará a favor de Münna." : "Se sumará automáticamente al saldo del proveedor."}</p>}</div>
        {purchaseError && <p role="alert" className="text-sm font-bold text-red-600">{purchaseError}</p>}
        <DialogFooter><Button variant="outline" disabled={savingPurchase} onClick={requestPurchaseClose}>Cancelar</Button><Button disabled={savingPurchase} onClick={savePurchase} className="bg-[#3b2931] text-white">{savingPurchase ? "Guardando…" : editingPurchaseId != null ? "Guardar cambios" : isCreditNote ? "Guardar nota de crédito" : "Guardar factura completa"}</Button></DialogFooter>
      </DialogContent></Dialog>
    </section>
  );
}

function Placeholder({ view }: { view: View }) {
  const data: Record<string, [string, string, typeof Boxes]> = {
    remitos: [
      "Remitos",
      "Historial de documentos emitidos, anulaciones y reimpresiones.",
      FileText,
    ],
    reportes: [
      "Reportes",
      "Analizá entregas por sucursal, sabor, envase, período e importe.",
      ClipboardList,
    ],
    productos: [
      "Productos",
      "Configurá sabores, presentaciones, precios, ingredientes y vencimientos.",
      ShoppingBag,
    ],
    clientes: [
      "Clientes",
      "Administrá descuentos, modalidad de envase y datos comerciales.",
      Building2,
    ],
    usuarios: [
      "Usuarios y permisos",
      "Definí qué pueden hacer operarios, encargado y administración.",
      Users,
    ],
  };
  const [title, description, Icon] = data[view] ?? [
    "Módulo",
    "Vista del sistema.",
    Boxes,
  ];
  return (
    <section className="grid min-h-[520px] place-items-center rounded-[28px] border border-dashed bg-white/70 p-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-[#fbe4ed] text-[#ac446d]">
          <Icon className="size-7" />
        </div>
        <h2 className="mt-5 text-3xl font-black">{title}</h2>
        <p className="mt-3 leading-7 text-muted-foreground">{description}</p>
        <Badge
          variant="outline"
          className="mt-5 rounded-full border-[#efc8d7] bg-[#fff5f8] text-[#aa426b]"
        >
          Incluido en la primera versión
        </Badge>
      </div>
    </section>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("inicio");
  const [productionRecords, setProductionRecords] = useState<ProductionRecord[]>([]);
  const [productionHistory, setProductionHistory] = useState<ProductionHistoryRow[]>([]);
  const [shiftRecords, setShiftRecords] = useState<ProductionRecord[]>([]);
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [productFamilies, setProductFamilies] = useState<ProductFamilyDefinition[]>(PRODUCT_FAMILIES);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [currentUser, setCurrentUser] = useState<StaffMember | null>(null);
  const [databaseStatus, setDatabaseStatus] = useState<"connecting" | "live" | "error">("connecting");
  useEffect(() => {
    let active = true;
    fetch("/api/operations")
      .then(async (response) => {
        const data = await response.json() as { stock?: Array<Record<string, unknown>>; productionHistory?: ProductionHistoryRow[]; clients?: Client[]; productFamilies?: ProductFamilyDefinition[]; staff?: StaffMember[]; currentUser?: StaffMember; nextUniqueCode?: string; productProfiles?: ProductProfile[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "No se pudo conectar con la base de datos.");
        if (!active) return;
        const savedProfiles = data.productProfiles ?? [];
        for (const product of savedProfiles) {
          if (product.active === false) inactiveProductCodes.add(product.code);
          else inactiveProductCodes.delete(product.code);
        }
        const activeProfiles = savedProfiles.filter((item) => item.active !== false);
        const profilesByCode = new Map(activeProfiles.map((item) => [item.code, item]));
        const baseCodes = new Set(productCatalog.map((item) => item.code));
        runtimeProductCatalog = [
          ...productCatalog.map((item) => ({ ...item, ...profilesByCode.get(item.code) })),
          ...activeProfiles.filter((item) => !baseCodes.has(item.code)),
        ];
        setProductionRecords((data.stock ?? []).map((unit) => ({
          uniqueCode: String(unit.uniqueCode), productCode: String(unit.productCode), productName: String(unit.productName),
          container: String(unit.container), weight: unit.weightKg == null ? null : Number(unit.weightKg), units: unit.units == null ? null : Number(unit.units),
          responsible: String(unit.responsible), time: new Date(String(unit.createdAt)).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
          family: String(unit.family), price: Number(unit.basePriceSnapshot), presentation: String(unit.presentation),
        })));
        setProductionHistory(data.productionHistory ?? []);
        const loadedFamilies = data.productFamilies?.length ? data.productFamilies : PRODUCT_FAMILIES;
        setProductFamilies(loadedFamilies);
        if (data.clients?.length) setClients(data.clients.map((client) => ({ ...client, discounts: normalizeProductFamilyDiscounts(client.discounts, loadedFamilies) })));
        setStaff(data.staff ?? []);
        setCurrentUser(data.currentUser ?? null);
        setDatabaseStatus("live");
      })
      .catch(() => active && setDatabaseStatus("error"));
    return () => { active = false; };
  }, []);
  const titles: Record<View, string> = {
    pedidos: "Pedidos y producción",
    cheques: "Cheques emitidos",
    inicio: "Panel general",
    produccion: "Producción",
    stock: "Stock de fábrica",
    eliminados: "Eliminados",
    "historico-produccion": "Histórico de producción",
    despacho: "Nuevo despacho",
    remitos: "Remitos",
    reportes: "Reportes",
    costos: "Costos y fórmulas",
    resultados: "Estado de resultados",
    "nueva-compra": "Nueva compra",
    productos: "Productos",
    clientes: "Clientes",
    "cta-clientes": "Cta. cte. clientes",
    usuarios: "Usuarios y permisos",
  };
  return (
    <SidebarProvider>
      <AppSidebar view={view} setView={setView} role={currentUser?.role ?? "administracion"} currentUser={currentUser} />
      <SidebarInset className="min-w-0 bg-[#fcf8fa]">
        <Header title={titles[view]} />
        <main className="mx-auto w-full max-w-[1500px] p-4 md:p-8">
          <div className={`mb-4 rounded-xl border px-4 py-2 text-sm font-bold ${databaseStatus === "live" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : databaseStatus === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            {databaseStatus === "live" ? "Sistema real activo · producción, stock y despachos quedan guardados" : databaseStatus === "error" ? "Sin conexión con la base de datos · no cargues movimientos hasta reconectar" : "Conectando con la base de datos…"}
          </div>
          {view === "inicio" && <Dashboard setView={setView} role={currentUser?.role ?? "administracion"} currentUser={currentUser} stock={productionRecords} history={productionHistory} />}{" "}
          {view === "pedidos" && <Orders />}
          {view === "produccion" && (
            <Production
              records={shiftRecords}
              onRegister={async (record) => {
                const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register-production", labelProtocol: 2, record }) });
                const result = await response.json() as { error?: string; unit?: { id: number; status?: string; created_at?: string; unique_code?: string } };
                if (!response.ok) throw new Error(result.error ?? "No se pudo registrar la producción.");
                if (!result.unit?.unique_code) throw new Error("No se confirmó el código de la unidad. No imprimas la etiqueta; recargá la página.");
                record = { ...record, uniqueCode: result.unit.unique_code };
                setShiftRecords((current) => [...current.filter((row) => row.uniqueCode !== record.uniqueCode), record]);
                setProductionRecords((current) => [...current.filter((row) => row.uniqueCode !== record.uniqueCode), record]);
                setProductionHistory((current) => [{
                  id: Number(result.unit?.id ?? Date.now()),
                  uniqueCode: record.uniqueCode,
                  productCode: record.productCode,
                  productName: record.productName,
                  presentation: record.presentation,
                  container: record.container,
                  weightKg: record.weight,
                  units: record.units,
                  responsible: record.responsible,
                  status: result.unit?.status ?? "stock",
                  producedAt: result.unit?.created_at ?? new Date().toISOString(),
                  dispatchedAt: null,
                  remittanceNumber: null,
                  clientName: null,
                }, ...current.filter((row) => row.uniqueCode !== record.uniqueCode)]);
                return record;
              }}
              onFinalize={() => setShiftRecords([])}
              responsibleOptions={staff}
            />
          )}{" "}
          {view === "stock" && <Stock records={productionRecords} onRemove={async (uniqueCode, reason, comment) => {
            const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove-stock", uniqueCode, reason, comment }) });
            const result = await response.json() as { error?: string; unit?: ProductionHistoryRow };
            if (!response.ok || !result.unit) throw new Error(result.error ?? "No se pudo eliminar la unidad.");
            const unit = result.unit;
            setProductionRecords((current) => current.filter((record) => record.uniqueCode !== uniqueCode));
            setShiftRecords((current) => current.filter((record) => record.uniqueCode !== uniqueCode));
            setProductionHistory((current) => [unit, ...current.filter((record) => record.uniqueCode !== uniqueCode)]);
          }} />} {view === "eliminados" && <DeletedStock rows={productionHistory} />} {view === "historico-produccion" && <ProductionHistory rows={productionHistory} canSeeCosts={currentUser?.role === "administracion"} />} {view === "despacho" && (
            <Dispatch
              clients={clients}
              productFamilies={productFamilies}
              availableUnits={productionRecords}
              onConfirm={async (codes, client) => {
                const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-dispatch", codes, client }) });
                const result = await response.json() as {
                  error?: string;
                  dispatch?: {
                    remittanceNumber?: string;
                    clientName?: string;
                    createdAt?: string;
                  };
                };
                if (!response.ok) throw new Error(result.error ?? "No se pudo confirmar el despacho.");
                const dispatchedAt = result.dispatch?.createdAt ?? new Date().toISOString();
                setProductionRecords((current) => current.filter((record) => !codes.includes(record.uniqueCode)));
                setProductionHistory((current) => current.map((row) => codes.includes(row.uniqueCode) ? {
                  ...row,
                  status: "despachado",
                  dispatchedAt,
                  remittanceNumber: result.dispatch?.remittanceNumber ?? row.remittanceNumber,
                  clientName: result.dispatch?.clientName || client.name,
                } : row));
              }}
            />
          )}{" "}
          {view === "productos" && <Products productFamilies={productFamilies} setProductFamilies={setProductFamilies} />} {view === "clientes" && <Clients clients={clients} setClients={setClients} productFamilies={productFamilies} />}{" "}
          {view === "cta-clientes" && <CustomerAccounts clients={clients} />}{" "}
          {view === "costos" && <Costs />}{" "}
          {view === "resultados" && <ProfitAndLoss />}{" "}
          {view === "cheques" && currentUser?.role === "administracion" && <IssuedChecks />}
          {view === "nueva-compra" && <Costs initialPurchaseOpen />}{" "}
          {view === "remitos" && <Remittances productionRows={productionHistory} canReturn={currentUser?.role === "administracion"} onReturned={async () => {
            const response = await fetch("/api/operations");
            const data = await response.json();
            if (!response.ok) throw new Error("Recargá la página para actualizar el stock.");
            setProductionHistory(data.productionHistory ?? []);
            setProductionRecords((data.stock ?? []).map((unit: Record<string, unknown>) => ({
              uniqueCode: String(unit.uniqueCode), productCode: String(unit.productCode), productName: String(unit.productName), container: String(unit.container),
              weight: unit.weightKg == null ? null : Number(unit.weightKg), units: unit.units == null ? null : Number(unit.units), responsible: String(unit.responsible),
              time: new Date(String(unit.createdAt)).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }), family: String(unit.family), price: Number(unit.basePriceSnapshot), presentation: String(unit.presentation),
            })));
          }} />}{" "}
          {view === "usuarios" && <StaffManagement staff={staff} setStaff={setStaff} />}{" "}
          {view === "reportes" && <Reports rows={productionHistory} canSeeCosts={currentUser?.role === "administracion"} />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
