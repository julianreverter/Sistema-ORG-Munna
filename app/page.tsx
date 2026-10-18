"use client";

import { useEffect, useMemo, useState, type Dispatch as StateDispatch, type SetStateAction } from "react";
import Image from "next/image";
import {
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
  Plus,
  Printer,
  Scale,
  Search,
  Store,
  Settings,
  ShoppingBag,
  Truck,
  WalletCards,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { productCatalog, type Product } from "@/lib/products";
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
  | "inicio"
  | "produccion"
  | "stock"
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
type ProductionHistoryRow = { id: number; uniqueCode: string; productCode: string; productName: string; presentation: string; container: string; weightKg: number | null; units: number | null; responsible: string; status: string; costPerKgSnapshot?: number | null; producedAt: string; dispatchedAt: string | null; remittanceNumber: string | null; clientName: string | null };
type StaffMember = { id: number; email: string; displayName: string; role: "produccion" | "encargado" | "administracion"; active: boolean };

const CODE39_PATTERNS: Record<string, string> = {
  "0": "nnwwnwnnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn",
  "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw",
  "8": "wnnwnnwnn", "9": "nnwwnnwnn", "*": "nwnnwnwnn",
};

function Code39Barcode({ value }: { value: string }) {
  const encoded = `*${value.replace(/[^0-9]/g, "")}*`;
  const bars: Array<{ x: number; width: number }> = [];
  let x = 0;
  for (const character of encoded) {
    const pattern = CODE39_PATTERNS[character];
    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === "w" ? 3 : 1;
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    }
    x += 1;
  }
  return (
    <svg
      className="barcode-svg h-8 w-full"
      viewBox={`0 0 ${x} 32`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Código de barras ${value}`}
    >
      {bars.map((bar, index) => (
        <rect key={index} x={bar.x} y="0" width={bar.width} height="32" fill="#000" />
      ))}
    </svg>
  );
}

function openProductionLabelWindow() {
  const printWindow = window.open("", "munna-production-label", "popup,width=900,height=700");
  if (printWindow) {
    printWindow.document.write("<!doctype html><title>Etiqueta Münna</title><p style='font-family:Arial;padding:24px'>Preparando etiqueta…</p>");
    printWindow.document.close();
  }
  return printWindow;
}

function printProductionLabel(printWindow: Window | null = openProductionLabelWindow()) {
  const label = document.getElementById("print-production-label");
  if (!label || !printWindow) return false;

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
          #print-production-label * { visibility: visible !important; }
          #print-production-label > div:last-child {
            position: absolute !important;
            left: 2mm !important;
            right: 2mm !important;
            bottom: 2mm !important;
            display: grid !important;
            grid-template-columns: 1fr 41mm !important;
            gap: 3mm !important;
            background: white !important;
            border-top: 1px solid black !important;
            padding-top: 1mm !important;
            z-index: 10 !important;
          }
          #print-production-label .barcode-svg {
            display: block !important;
            width: 100% !important;
            height: 8mm !important;
          }
        </style>
      </head>
      <body>${label.outerHTML}</body>
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
    printWindow.focus();
    printWindow.print();
  };

  window.setTimeout(openPrintDialog, 100);

  return true;
}

const menu = [
  ["inicio", "Inicio", LayoutDashboard],
  ["produccion", "Producción", IceCreamBowl],
  ["stock", "Stock de fábrica", Boxes],
  ["historico-produccion", "Histórico producido", ClipboardList],
  ["despacho", "Nuevo despacho", Truck],
  ["remitos", "Remitos", FileText],
  ["reportes", "Reportes", ClipboardList],
] as const;
const adminMenu = [
  ["resultados", "Estado de resultados", WalletCards],
  ["costos", "Costos y formulas", Calculator],
  ["productos", "Productos", ShoppingBag],
  ["clientes", "Clientes", Building2],
  ["cta-clientes", "Cta. cte. clientes", WalletCards],
  ["usuarios", "Usuarios y permisos", Users],
] as const;

const productionProducts = productCatalog.map(
  (product) => `${product.code} · ${product.name}`,
);

const stockRows = [
  {
    code: "228",
    name: "Chocolate",
    pack: "Balde",
    units: 18,
    kg: "128,54",
    status: "Normal",
  },
  {
    code: "214",
    name: "Pistacho",
    pack: "Balde",
    units: 6,
    kg: "42,18",
    status: "Bajo",
  },
  {
    code: "131",
    name: "Chocolate blanco c/ frambuesa",
    pack: "Vasqueta",
    units: 14,
    kg: "48,92",
    status: "Normal",
  },
  {
    code: "ALF-01",
    name: "Alfajor clásico",
    pack: "Caja x 15",
    units: 9,
    kg: "—",
    status: "Normal",
  },
  {
    code: "INS-08",
    name: "Bolsa Münna Nº 4",
    pack: "Millar",
    units: 2,
    kg: "—",
    status: "Bajo",
  },
];
const recent = [
  {
    id: "004528",
    detail: "Chocolate · Balde",
    weight: "7,155 kg",
    person: "Lucas M.",
    time: "08:42",
  },
  {
    id: "004527",
    detail: "Pistacho · Vasqueta",
    weight: "3,480 kg",
    person: "Evelyn R.",
    time: "08:37",
  },
  {
    id: "004526",
    detail: "Dulce de leche Münna · Balde",
    weight: "6,920 kg",
    person: "Lucas M.",
    time: "08:31",
  },
];

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
  const operationItems = role === "produccion" ? menu.filter(([id]) => ["inicio", "produccion", "despacho"].includes(id)) : menu;
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

function Dashboard({ setView, role }: { setView: (v: View) => void; role: StaffMember["role"] }) {
  return (
    <div className="space-y-7">
      <section className="munna-hero relative overflow-hidden rounded-[28px] bg-[#3c2931] px-6 py-7 text-white md:px-9">
        <div className="relative z-10 max-w-xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-[#f2a9c4]">
            Jueves 27 de agosto
          </p>
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">
            Buen día, Rever.
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-[#e9dce1]">
            La producción está al día. Hay 2 productos con stock bajo y un
            despacho preparado para Rojas.
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
          value="286"
          note="Baldes, vasquetas y cajas"
        />
        <Metric
          icon={Scale}
          label="Helado disponible"
          value="1.184 kg"
          note="Peso neto en cámara"
          tone="green"
        />
        <Metric
          icon={Truck}
          label="Despachado este mes"
          value="2.438 kg"
          note="A todas las sucursales"
          tone="brown"
        />
        <Metric
          icon={Archive}
          label="Stock bajo"
          value="2"
          note="Requieren reposición"
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
            {recent.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-4 rounded-2xl p-3 hover:bg-[#fff9fb]"
              >
                <div className="grid size-10 place-items-center rounded-xl bg-[#fdeaf1] text-[#ae456d]">
                  <Barcode className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{row.detail}</p>
                  <p className="text-xs text-muted-foreground">
                    #{row.id} · {row.person}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black">{row.weight}</p>
                  <p className="text-xs text-muted-foreground">{row.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[24px] border bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="font-black">Próximo despacho</h3>
              <p className="text-sm text-muted-foreground">
                Remito en preparación
              </p>
            </div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
              Borrador
            </span>
          </div>
          <div className="rounded-2xl bg-[#fff5f8] p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-[#b56a86]">
              Sucursal Rojas
            </p>
            <p className="mt-1 text-2xl font-black">Remito #553</p>
            <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Escaneados</p>
                <p className="font-black">18 productos</p>
              </div>
              <div>
                <p className="text-muted-foreground">Peso neto</p>
                <p className="font-black">116,84 kg</p>
              </div>
            </div>
          </div>
          <Button
            onClick={() => setView("despacho")}
            className="mt-4 w-full rounded-xl bg-[#3c2931] text-white"
          >
            Continuar carga
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
  nextUniqueCode,
  responsibleOptions,
}: {
  records: ProductionRecord[];
  onRegister: (record: ProductionRecord) => Promise<void>;
  onFinalize: () => void;
  nextUniqueCode: string;
  responsibleOptions: StaffMember[];
}) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [product, setProduct] = useState("");
  const [weight, setWeight] = useState("7.155");
  const [quantity, setQuantity] = useState("20");
  const [responsible, setResponsible] = useState("");
  const selectedResponsible = responsible || responsibleOptions[0]?.displayName || "Sin asignar";
  const selectedProduct = productCatalog.find(
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
              items={productionProducts}
              value={product}
              onValueChange={(value) => {
                if (!value) return;
                setProduct(value);
                const nextProduct = productCatalog.find((item) => `${item.code} · ${item.name}` === value);
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
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-bold">
            Responsable
            <select value={selectedResponsible} onChange={(event) => setResponsible(event.target.value)} className="h-11 w-full rounded-xl border bg-white px-3 font-normal">
              {responsibleOptions.filter((member) => member.active).map((member) => <option key={member.id} value={member.displayName}>{member.displayName}</option>)}
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
          disabled={!product || !selectedProduct || saved || saving || (isWeightProduct ? !weight.trim() : !quantity.trim())}
          onClick={async () => {
            if (!selectedProduct) return;
            const printWindow = openProductionLabelWindow();
            setSaving(true);
            setSaveError("");
            try {
              await onRegister({
                uniqueCode: nextUniqueCode,
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
              setSaved(true);
              if (!printProductionLabel(printWindow)) {
                setSaveError("La producción se guardó, pero Chrome bloqueó la ventana de impresión. Habilitá las ventanas emergentes y usá Reimprimir etiqueta.");
              }
            } catch (error) {
              printWindow?.close();
              setSaveError(error instanceof Error ? error.message : "No se pudo registrar la producción.");
            } finally {
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
              if (!printProductionLabel(printWindow)) {
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
        <div id="print-production-label" className="production-label relative mx-auto max-w-xl overflow-hidden rounded-xl border-2 border-black bg-white p-2 pb-[58px] text-black shadow-lg">
          <div className="flex items-start justify-between border-b-2 border-black pb-1">
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
            <div className="text-right">
              <p className="text-[9px] font-bold">CÓDIGO ÚNICO</p>
              <p className="text-sm font-black">#{nextUniqueCode}</p>
            </div>
          </div>
          <h3 className="mt-2 text-xl font-black uppercase leading-tight">
            {selectedProduct?.name ?? "Seleccioná un producto"}
          </h3>
          <p className="text-sm font-bold">{selectedProduct?.container ?? "—"}</p>
          <div className="my-1 border-y-2 border-black py-1 text-center">
            <p className="text-[10px] font-bold uppercase">{isWeightProduct ? "Peso neto" : "Contenido"}</p>
            <p className="text-[26px] font-black leading-none">
              {isWeightProduct ? `${displayedWeight} kg` : `${quantity || "0"} unidades`}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[10px] leading-tight">
            <p>
              <b>Elaboración</b>
              <br />
              27/08/2026
            </p>
            <p>
              <b>Vencimiento</b>
              <br />
              27/08/2027
            </p>
            <p>
              <b>Lote</b>
              <br />
              270826-CHM-01
            </p>
          </div>
          <p className="mt-2 line-clamp-2 text-[8px] leading-[10px]">
            <b>Ingredientes:</b>{" "}
            {selectedProduct?.ingredients || "Pendientes de completar."}
          </p>
          <p className="mt-1 text-[8px] font-black uppercase leading-[10px]">Contiene leche y derivados.</p>
          <div className="absolute bottom-2 left-2 right-2 grid grid-cols-[1fr_155px] gap-3 border-t border-black bg-white pt-1">
            <div className="text-[8px] leading-[10px]">
              <p className="font-black">INDUSTRIA ARGENTINA</p>
              <p>Elaborado por: Julián Reverter</p>
              <p>Planta: Juan B. Justo 1531, Pergamino, Bs. As.</p>
              <p>Tel.: 2477 667357</p>
              <p><b>RNE:</b> pendiente · <b>RNPA:</b> pendiente</p>
            </div>
            <div>
              <Code39Barcode value={nextUniqueCode} />
              <p className="mt-0.5 text-center font-mono text-[9px] tracking-[.26em]">{nextUniqueCode}</p>
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

function Stock({ records }: { records: ProductionRecord[] }) {
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Códigos de barra</TableHead>
            <TableHead>Producto</TableHead>
            <TableHead>Presentación</TableHead>
            <TableHead className="text-right">Unidades</TableHead>
            <TableHead className="text-right">Kg netos</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No hay stock disponible para esta búsqueda.</TableCell></TableRow>}
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

const demoStockUnits: ProductionRecord[] = [
  { uniqueCode: "004528", productCode: "230", productName: "Chocolate Münna B.G", container: "Balde retornable", weight: 7.155, units: null, responsible: "Lucas Martínez", time: "08:42", family: "Helado", price: 27000, presentation: "Balde grande" },
  { uniqueCode: "004527", productCode: "214", productName: "Pistacho Vaq.", container: "Vasqueta", weight: 3.48, units: null, responsible: "Evelyn R.", time: "08:37", family: "Helado", price: 30000, presentation: "Vasqueta" },
  { uniqueCode: "CAJ00084", productCode: "1002", productName: "Alfajor Helado Americana", container: "Caja", weight: null, units: 20, responsible: "Lucas Martínez", time: "08:31", family: "Postre congelado", price: 40000, presentation: "Caja x 20" },
];

function ProductionHistory({ rows }: { rows: ProductionHistoryRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos");
  const normalizedQuery = query.trim().toLowerCase();
  const compactQuery = normalizedQuery.replace(/[^a-z0-9]/g, "");
  const filtered = rows.filter((row) => {
    const haystack = `${row.uniqueCode} ${row.productCode} ${row.productName} ${row.responsible} ${row.clientName ?? ""} ${row.remittanceNumber ?? ""}`.toLowerCase();
    const compactHaystack = haystack.replace(/[^a-z0-9]/g, "");
    const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery) || compactHaystack.includes(compactQuery);
    return matchesQuery && (status === "Todos" || (status === "En stock" ? row.status === "stock" : row.status === "despachado"));
  });
  const exportExcel = () => {
    const escape = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const body = filtered.map((row) => `<tr><td>${escape(new Date(row.producedAt).toLocaleString("es-AR"))}</td><td>${escape(row.uniqueCode)}</td><td>${escape(row.productCode)}</td><td>${escape(row.productName)}</td><td>${escape(row.presentation)}</td><td>${escape(row.weightKg ?? "")}</td><td>${escape(row.units ?? "")}</td><td>${escape(row.responsible)}</td><td>${escape(row.status === "stock" ? "En stock" : "Despachado")}</td><td>${escape(row.clientName ?? "")}</td><td>${escape(row.remittanceNumber ?? "")}</td><td>${escape(row.dispatchedAt ? new Date(row.dispatchedAt).toLocaleString("es-AR") : "")}</td></tr>`).join("");
    const html = `<html><head><meta charset="UTF-8"></head><body><table border="1"><tr><th>Fecha y hora producción</th><th>Código único</th><th>Código producto</th><th>Producto</th><th>Presentación</th><th>Kg</th><th>Unidades</th><th>Responsable</th><th>Estado</th><th>Destino</th><th>Remito</th><th>Fecha despacho</th></tr>${body}</table></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `historico-produccion-${new Date().toISOString().slice(0, 10)}.xls`; link.click(); URL.revokeObjectURL(url);
  };
  return <section className="space-y-5"><div className="flex flex-col gap-4 rounded-3xl border bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between"><div><Badge className="bg-[#f4d5e1] text-[#983f62]">Trazabilidad</Badge><h2 className="mt-3 text-3xl font-black">Histórico de producción</h2><p className="mt-1 text-muted-foreground">Seguimiento completo desde la elaboración hasta la sucursal de destino.</p></div><Button onClick={exportExcel} className="rounded-xl bg-[#3b2931] text-white"><FileText /> Descargar Excel</Button></div><div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar sabor, código, responsable, sucursal o remito" className="pl-9"/></div><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-md border bg-white px-3"><option>Todos</option><option>En stock</option><option>Despachados</option></select></div><div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Producción</TableHead><TableHead>Código</TableHead><TableHead>Producto</TableHead><TableHead>Kg / unidades</TableHead><TableHead>Responsable</TableHead><TableHead>Estado</TableHead><TableHead>Destino / remito</TableHead></TableRow></TableHeader><TableBody>{filtered.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No hay registros para estos filtros.</TableCell></TableRow>}{filtered.map((row) => <TableRow key={row.id}><TableCell className="whitespace-nowrap"><b>{new Date(row.producedAt).toLocaleDateString("es-AR")}</b><div className="text-xs text-muted-foreground">{new Date(row.producedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</div></TableCell><TableCell className="font-mono font-bold">{row.uniqueCode}</TableCell><TableCell><b>{row.productName}</b><div className="text-xs text-muted-foreground">{row.productCode} · {row.presentation}</div></TableCell><TableCell>{row.weightKg != null ? `${Number(row.weightKg).toLocaleString("es-AR", { minimumFractionDigits: 3 })} kg` : `${row.units ?? 0} u.`}</TableCell><TableCell>{row.responsible}</TableCell><TableCell><Badge className={row.status === "stock" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}>{row.status === "stock" ? "En stock" : "Despachado"}</Badge></TableCell><TableCell>{row.clientName ? <><b>{row.clientName}</b><div className="text-xs text-muted-foreground">{row.remittanceNumber} · {row.dispatchedAt ? new Date(row.dispatchedAt).toLocaleDateString("es-AR") : ""}</div></> : <span className="text-muted-foreground">Sin despacho</span>}</TableCell></TableRow>)}</TableBody></Table></div></div></section>;
}

function Reports({ rows }: { rows: ProductionHistoryRow[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T23:59:59`).getTime();
  const configuredCosts: Record<string, number> = { "Chocolate Münna B.G": 5807, "Chocolate Münna": 5807, "Pistacho Vaq.": 8548, "Pistacho": 8548, "Dulce de leche Münna": 5236, "Frutilla a la crema": 4794 };
  const costPerKg = (row: ProductionHistoryRow) => Number(row.costPerKgSnapshot ?? configuredCosts[row.productName] ?? 0);
  const periodRows = rows.filter((row) => { const time = new Date(row.producedAt).getTime(); return time >= start && time <= end; });
  const producedKg = periodRows.reduce((sum, row) => sum + Number(row.weightKg ?? 0), 0);
  const productionCost = periodRows.reduce((sum, row) => sum + Number(row.weightKg ?? 0) * costPerKg(row), 0);
  const openingRows = rows.filter((row) => new Date(row.producedAt).getTime() < start && (!row.dispatchedAt || new Date(row.dispatchedAt).getTime() >= start));
  const currentRows = rows.filter((row) => row.status === "stock");
  const stockData = (source: ProductionHistoryRow[]) => ({ kg: source.reduce((sum, row) => sum + Number(row.weightKg ?? 0), 0), value: source.reduce((sum, row) => sum + Number(row.weightKg ?? 0) * costPerKg(row), 0) });
  const opening = stockData(openingRows), current = stockData(currentRows);
  const delivered = rows.filter((row) => row.dispatchedAt && new Date(row.dispatchedAt).getTime() >= start && new Date(row.dispatchedAt).getTime() <= end);
  const byClient = Object.values(delivered.reduce<Record<string, { name: string; kg: number; cost: number }>>((acc, row) => { const name = row.clientName ?? "Sin destino"; acc[name] ??= { name, kg: 0, cost: 0 }; acc[name].kg += Number(row.weightKg ?? 0); acc[name].cost += Number(row.weightKg ?? 0) * costPerKg(row); return acc; }, {})).sort((a, b) => b.kg - a.kg);
  const byPerson = Object.values(periodRows.reduce<Record<string, { name: string; kg: number; units: number; records: number }>>((acc, row) => { acc[row.responsible] ??= { name: row.responsible, kg: 0, units: 0, records: 0 }; acc[row.responsible].kg += Number(row.weightKg ?? 0); acc[row.responsible].units += Number(row.units ?? 0); acc[row.responsible].records += 1; return acc; }, {})).sort((a, b) => b.kg - a.kg);
  const byFlavor = Object.values(periodRows.reduce<Record<string, { name: string; kg: number; cost: number }>>((acc, row) => { acc[row.productName] ??= { name: row.productName, kg: 0, cost: 0 }; acc[row.productName].kg += Number(row.weightKg ?? 0); acc[row.productName].cost += Number(row.weightKg ?? 0) * costPerKg(row); return acc; }, {})).sort((a, b) => b.kg - a.kg).slice(0, 8);
  const costCoverage = periodRows.length ? Math.round(periodRows.filter((row) => costPerKg(row) > 0).length / periodRows.length * 100) : 100;
  return <section className="space-y-5"><div className="flex flex-col gap-4 rounded-3xl border bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between"><div><Badge className="bg-[#f4d5e1] text-[#983f62]">Análisis</Badge><h2 className="mt-3 text-3xl font-black">Reportes de producción</h2><p className="mt-1 text-muted-foreground">Producción, costos, inventario y rendimiento por destino y persona.</p></div><div className="flex gap-3"><label className="text-xs font-bold">Desde<Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1"/></label><label className="text-xs font-bold">Hasta<Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1"/></label></div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Producción total", `${producedKg.toLocaleString("es-AR", { maximumFractionDigits: 1 })} kg`, `${periodRows.length} unidades o cajas`],["Costo de producción", money(productionCost), `Promedio ${producedKg ? money(productionCost / producedKg) : money(0)} por kg`],["Stock inicial", `${opening.kg.toLocaleString("es-AR", { maximumFractionDigits: 1 })} kg`, `Valorizado en ${money(opening.value)}`],["Stock actual", `${current.kg.toLocaleString("es-AR", { maximumFractionDigits: 1 })} kg`, `Valorizado en ${money(current.value)}`]].map(([label,value,note]) => <div key={label} className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-sm font-bold text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-black">{value}</p><p className="mt-2 text-xs text-muted-foreground">{note}</p></div>)}</div>
    <div className="rounded-2xl border bg-[#fff8fb] p-4 text-sm"><b>Cobertura de costos de fórmulas: {costCoverage}%.</b> {costCoverage < 100 ? "Las unidades sin fórmula valorizada se computan con costo $0 hasta completar su receta." : "Todos los registros del período tienen costo configurado."}</div>
    <div className="grid gap-5 xl:grid-cols-2"><div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b p-5"><h3 className="text-xl font-black">Kg enviados por cliente</h3><p className="text-sm text-muted-foreground">Despachos realizados dentro del período.</p></div><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead className="text-right">Kg</TableHead><TableHead className="text-right">Costo</TableHead></TableRow></TableHeader><TableBody>{byClient.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sin despachos</TableCell></TableRow>}{byClient.map((row) => <TableRow key={row.name}><TableCell className="font-bold">{row.name}</TableCell><TableCell className="text-right">{row.kg.toLocaleString("es-AR", { maximumFractionDigits: 1 })}</TableCell><TableCell className="text-right font-bold">{money(row.cost)}</TableCell></TableRow>)}</TableBody></Table></div><div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b p-5"><h3 className="text-xl font-black">Producción por persona</h3><p className="text-sm text-muted-foreground">Rendimiento individual del equipo.</p></div><Table><TableHeader><TableRow><TableHead>Responsable</TableHead><TableHead className="text-right">Kg</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Registros</TableHead></TableRow></TableHeader><TableBody>{byPerson.map((row) => <TableRow key={row.name}><TableCell className="font-bold">{row.name}</TableCell><TableCell className="text-right">{row.kg.toLocaleString("es-AR", { maximumFractionDigits: 1 })}</TableCell><TableCell className="text-right">{row.units}</TableCell><TableCell className="text-right">{row.records}</TableCell></TableRow>)}</TableBody></Table></div></div>
    <div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b p-5"><h3 className="text-xl font-black">Sabores más producidos</h3><p className="text-sm text-muted-foreground">Volumen y costo por producto durante el período.</p></div><Table><TableHeader><TableRow><TableHead>Producto</TableHead><TableHead className="text-right">Kg producidos</TableHead><TableHead className="text-right">Costo total</TableHead><TableHead className="text-right">Costo/kg</TableHead></TableRow></TableHeader><TableBody>{byFlavor.map((row) => <TableRow key={row.name}><TableCell className="font-bold">{row.name}</TableCell><TableCell className="text-right">{row.kg.toLocaleString("es-AR", { maximumFractionDigits: 1 })}</TableCell><TableCell className="text-right">{money(row.cost)}</TableCell><TableCell className="text-right">{row.kg ? money(row.cost / row.kg) : money(0)}</TableCell></TableRow>)}</TableBody></Table></div>
  </section>;
}

function discountFor(client: Client, family: string) {
  if (family === "Helado") return client.discounts.helado;
  if (family === "Postre congelado") return client.discounts.postres;
  if (family === "Pastelería") return client.discounts.pasteleria;
  if (family === "Insumo comprado") return client.discounts.insumos;
  if (family === "Indumentaria") return client.discounts.indumentaria;
  return 0;
}

function Dispatch({ clients, availableUnits, onConfirm }: { clients: Client[]; availableUnits: ProductionRecord[]; onConfirm: (codes: string[], client: Client) => Promise<void> }) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? 0);
  const [scanValue, setScanValue] = useState("");
  const [lines, setLines] = useState<ProductionRecord[]>([]);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedClient = clients.find((client) => client.id === clientId) ?? clients[0];
  const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  const tareFor = (record: ProductionRecord) => record.container.toLowerCase().includes("balde") ? 0.28 : 0.12;
  const lineAmount = (record: ProductionRecord) => {
    if (!selectedClient) return 0;
    const billableWeight = record.weight === null ? null : record.weight + (selectedClient.billingWeight === "Bruto" ? tareFor(record) : 0);
    const subtotal = billableWeight === null ? record.price : billableWeight * record.price;
    return subtotal * (1 - discountFor(selectedClient, record.family) / 100);
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
          <select value={clientId} onChange={(event) => { setClientId(Number(event.target.value)); setMessage(null); }} className="h-12 w-full rounded-xl border bg-white px-3 font-normal">
            {clients.filter((client) => client.active).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl bg-[#fff4f8] p-4">
            <p className="text-xs text-muted-foreground">Descuentos asignados</p>
            <p className="mt-1 text-sm font-black">Helado {selectedClient?.discounts.helado ?? 0}% · Postres {selectedClient?.discounts.postres ?? 0}% · Pastelería {selectedClient?.discounts.pasteleria ?? 0}%</p>
          </div>
          <div className="rounded-2xl bg-[#f2f7f3] p-4">
            <p className="text-xs text-muted-foreground">Modalidad de envase</p>
            <p className="text-sm font-black">{selectedClient?.returnable ? "Retornable" : "No retornable"} · cobra peso {selectedClient?.billingWeight.toLowerCase()}</p>
          </div>
        </div>
        <div className="mt-7">
          <p className="mb-2 text-sm font-bold">Escanear código único</p>
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); scan(scanValue); }}>
            <Input autoFocus value={scanValue} onChange={(event) => setScanValue(event.target.value)} placeholder="Escaneá o escribí el código…" className="h-12 rounded-xl font-mono" />
            <Button type="submit" size="icon" className="size-12 rounded-xl bg-[#3c2931]"><Barcode /></Button>
          </form>
          {message && <p className={`mt-2 text-sm font-bold ${message.type === "error" ? "text-red-600" : "text-emerald-700"}`}>{message.text}</p>}
          <div className="mt-5 rounded-2xl border border-dashed bg-[#fff9fb] p-4">
            <p className="text-xs font-black uppercase tracking-wider text-[#a94068]">Códigos para probar ahora</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["004528", "004527", "CAJ00084"].map((code) => <button key={code} type="button" onClick={() => scan(code)} className="rounded-lg border bg-white px-3 py-2 font-mono text-sm font-bold hover:border-[#ed94b5]">{code}</button>)}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">También podés escribir el código y presionar Enter. Eso simula exactamente un lector USB.</p>
          </div>
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
                <p className="text-xs text-muted-foreground">#{record.uniqueCode} · {record.weight !== null ? `${record.weight.toLocaleString("es-AR", { minimumFractionDigits: 3 })} kg ${selectedClient?.billingWeight.toLowerCase()}` : `${record.units} unidades`} · Desc. {selectedClient ? discountFor(selectedClient, record.family) : 0}%</p>
              </div>
              <div className="text-right"><p className="text-sm font-black">{currency.format(lineAmount(record))}</p><button onClick={() => setLines((current) => current.filter((item) => item.uniqueCode !== record.uniqueCode))} className="text-xs font-bold text-[#a94068]">Quitar</button></div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-end justify-between border-t pt-5">
          <div><p className="text-sm text-muted-foreground">{lines.length} productos escaneados</p><p className="text-sm font-bold">Peso neto: {totalWeight.toLocaleString("es-AR", { minimumFractionDigits: 3 })} kg</p></div>
          <div className="text-right"><p className="text-xs uppercase text-muted-foreground">Total con descuento</p><p className="text-3xl font-black">{currency.format(total)}</p></div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button disabled={!lines.length || !selectedClient} className="mt-5 h-12 w-full rounded-xl bg-[#ed94b5] font-black text-[#3c2931] hover:bg-[#f2a8c3]"><FileText /> Confirmar y generar remito</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>¿Confirmar despacho a {selectedClient?.name}?</AlertDialogTitle><AlertDialogDescription>Los {lines.length} productos se descontarán del stock de fábrica y quedará generado el remito.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Volver</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={async (event) => { event.preventDefault(); if (!selectedClient) return; setSaving(true); try { await onConfirm(lines.map((record) => record.uniqueCode), selectedClient); setLines([]); setMessage({ type: "ok", text: "Despacho confirmado, remito generado y stock actualizado." }); } catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo confirmar el despacho." }); } finally { setSaving(false); } }} className="bg-[#ed94b5] font-black text-[#3c2931] hover:bg-[#f2a8c3]">{saving ? "Guardando…" : "Confirmar despacho"}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}

function Products() {
  const [products, setProducts] = useState<Product[]>(productCatalog);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
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

  return (
    <section className="rounded-[26px] border bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-black">Maestro de productos</h2>
          <p className="text-sm text-muted-foreground">
            {products.length} productos activos · seleccioná uno para editarlo
          </p>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, código o familia"
            className="h-10 rounded-xl pl-9"
          />
        </div>
      </div>
      <div className="max-h-[650px] overflow-auto rounded-2xl border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-[#fff4f8]">
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Familia</TableHead>
              <TableHead>Presentación</TableHead>
              <TableHead className="text-right">Precio base</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((product) => (
              <TableRow
                key={product.code}
                className="cursor-pointer"
                onClick={() => setEditing({ ...product })}
              >
                <TableCell className="font-mono font-bold">{product.code}</TableCell>
                <TableCell className="font-bold">{product.name}</TableCell>
                <TableCell>{product.family}</TableCell>
                <TableCell>{product.presentation}</TableCell>
                <TableCell className="text-right font-semibold">
                  {currency.format(product.price)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditing({ ...product });
                    }}
                  >
                    Editar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Mostrando {rows.length} productos. Esta versión continúa siendo una maqueta con datos de prueba.
      </p>
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar producto</DialogTitle>
            <DialogDescription>
              Los cambios sirven para probar el circuito y se reinician al recargar la maqueta.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-bold">
                Código
                <Input value={editing.code} readOnly className="font-mono font-normal" />
              </label>
              <label className="space-y-2 text-sm font-bold">
                Precio base
                <Input
                  type="number"
                  value={editing.price}
                  onChange={(event) => setEditing({ ...editing, price: Number(event.target.value) })}
                  className="font-normal"
                />
              </label>
              <label className="space-y-2 text-sm font-bold sm:col-span-2">
                Nombre para sistema y etiqueta
                <Input
                  value={editing.name}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                  className="font-normal"
                />
              </label>
              <label className="space-y-2 text-sm font-bold">
                Familia
                <Input
                  value={editing.family}
                  onChange={(event) => setEditing({ ...editing, family: event.target.value })}
                  className="font-normal"
                />
              </label>
              <label className="space-y-2 text-sm font-bold">
                Presentación
                <Input
                  value={editing.presentation}
                  onChange={(event) => setEditing({ ...editing, presentation: event.target.value })}
                  className="font-normal"
                />
              </label>
              <label className="space-y-2 text-sm font-bold">
                Envase
                <Input
                  value={editing.container}
                  onChange={(event) => setEditing({ ...editing, container: event.target.value })}
                  className="font-normal"
                />
              </label>
              <label className="space-y-2 text-sm font-bold">
                Vencimiento (días)
                <Input
                  type="number"
                  value={editing.expiryDays}
                  onChange={(event) => setEditing({ ...editing, expiryDays: Number(event.target.value) })}
                  className="font-normal"
                />
              </label>
              <label className="space-y-2 text-sm font-bold sm:col-span-2">
                Ingredientes
                <Textarea
                  value={editing.ingredients}
                  placeholder="Pendiente de completar"
                  onChange={(event) => setEditing({ ...editing, ingredients: event.target.value })}
                  className="min-h-24 font-normal"
                />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              className="bg-[#ed94b5] font-black text-[#3c2931] hover:bg-[#f2a8c3]"
              onClick={() => {
                if (!editing) return;
                setProducts((current) => current.map((item) => item.code === editing.code ? editing : item));
                setEditing(null);
              }}
            >
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

type Client = {
  id: number;
  name: string;
  kind: string;
  discounts: {
    helado: number;
    postres: number;
    pasteleria: number;
    insumos: number;
    indumentaria: number;
  };
  returnable: boolean;
  billingWeight: "Neto" | "Bruto";
  active: boolean;
};

const initialClients: Client[] = [
  { id: 1, name: "Franquicia Rojas", kind: "Franquicia", discounts: { helado: 50, postres: 35, pasteleria: 30, insumos: 10, indumentaria: 0 }, returnable: true, billingWeight: "Neto", active: true },
  { id: 2, name: "Sucursal Av. de Mayo", kind: "Sucursal propia", discounts: { helado: 50, postres: 35, pasteleria: 30, insumos: 10, indumentaria: 0 }, returnable: true, billingWeight: "Neto", active: true },
  { id: 3, name: "Sucursal Centenario", kind: "Sucursal propia", discounts: { helado: 50, postres: 35, pasteleria: 30, insumos: 10, indumentaria: 0 }, returnable: true, billingWeight: "Neto", active: true },
  { id: 4, name: "Evento ocasional", kind: "Evento", discounts: { helado: 0, postres: 0, pasteleria: 0, insumos: 0, indumentaria: 0 }, returnable: false, billingWeight: "Bruto", active: true },
];

function Clients({ clients, setClients }: { clients: Client[]; setClients: StateDispatch<SetStateAction<Client[]>> }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Client | null>(null);
  const filtered = clients.filter((client) =>
    `${client.name} ${client.kind}`.toLowerCase().includes(query.toLowerCase()),
  );
  const emptyClient = (): Client => ({
    id: Math.max(0, ...clients.map((client) => client.id)) + 1,
    name: "",
    kind: "Franquicia",
    discounts: { helado: 0, postres: 0, pasteleria: 0, insumos: 0, indumentaria: 0 },
    returnable: true,
    billingWeight: "Neto",
    active: true,
  });

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
          <Button onClick={() => setEditing(emptyClient())} className="rounded-xl bg-[#ed94b5] font-black text-[#3c2931] hover:bg-[#f2a8c3]">
            <Plus /> Nuevo cliente
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border">
        <Table>
          <TableHeader className="bg-[#fff4f8]">
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Descuentos por línea</TableHead>
              <TableHead>Envase</TableHead>
              <TableHead>Peso facturable</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="font-bold">{client.name}</TableCell>
                <TableCell>{client.kind}</TableCell>
                <TableCell className="max-w-xs text-xs leading-5">
                  Helado {client.discounts.helado}% · Postres {client.discounts.postres}% · Pastelería {client.discounts.pasteleria}% · Insumos {client.discounts.insumos}%
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-full">
                    {client.returnable ? "Retornable" : "No retornable"}
                  </Badge>
                </TableCell>
                <TableCell>{client.billingWeight}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setEditing({ ...client })}>
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
            <DialogTitle>{editing && clients.some((client) => client.id === editing.id) ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
            <DialogDescription>
              Estas reglas se aplicarán automáticamente cuando se prepare el remito.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-bold sm:col-span-2">
                Nombre o razón social
                <Input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="font-normal" />
              </label>
              <label className="space-y-2 text-sm font-bold">
                Tipo de cliente
                <select value={editing.kind} onChange={(event) => setEditing({ ...editing, kind: event.target.value })} className="h-10 w-full rounded-md border bg-white px-3 font-normal">
                  <option>Franquicia</option>
                  <option>Sucursal propia</option>
                  <option>Evento</option>
                  <option>Mayorista</option>
                </select>
              </label>
              <div className="rounded-xl border bg-[#fff8fb] p-4 sm:col-span-2">
                <p className="mb-3 text-sm font-black">Descuento por línea de producto</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ["helado", "Helados"],
                    ["postres", "Postres congelados"],
                    ["pasteleria", "Pastelería"],
                    ["insumos", "Insumos comprados"],
                    ["indumentaria", "Indumentaria"],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="space-y-1 text-sm font-bold">
                      {label} (%)
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={editing.discounts[key]}
                        onChange={(event) => setEditing({
                          ...editing,
                          discounts: { ...editing.discounts, [key]: Number(event.target.value) },
                        })}
                        className="font-normal"
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border p-4 sm:col-span-2">
                <div>
                  <p className="text-sm font-bold">Envase retornable</p>
                  <p className="text-xs text-muted-foreground">Si devuelve baldes, se factura solamente el peso neto.</p>
                </div>
                <Switch
                  checked={editing.returnable}
                  onCheckedChange={(checked) => setEditing({ ...editing, returnable: checked, billingWeight: checked ? "Neto" : "Bruto" })}
                />
              </div>
              <label className="space-y-2 text-sm font-bold sm:col-span-2">
                Peso que se factura
                <select value={editing.billingWeight} onChange={(event) => setEditing({ ...editing, billingWeight: event.target.value as "Neto" | "Bruto" })} className="h-10 w-full rounded-md border bg-white px-3 font-normal">
                  <option value="Neto">Neto: solamente el helado</option>
                  <option value="Bruto">Bruto: helado más envase</option>
                </select>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              disabled={!editing?.name.trim()}
              className="bg-[#ed94b5] font-black text-[#3c2931] hover:bg-[#f2a8c3]"
              onClick={() => {
                if (!editing) return;
                setClients((current) => current.some((client) => client.id === editing.id)
                  ? current.map((client) => client.id === editing.id ? editing : client)
                  : [...current, editing]);
                setEditing(null);
              }}
            >
              Guardar cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

const remittanceRows = [
  { number: "R-000184", date: "08/10/2026", client: "Franquicia Rojas", units: 13, kg: "17,855", subtotal: "$548.325", discount: "Por línea", total: "$283.163", status: "Confirmado" },
  { number: "R-000183", date: "07/10/2026", client: "Sucursal Centenario", units: 12, kg: "79,260", subtotal: "$1.965.700", discount: "Por línea", total: "$982.850", status: "Confirmado" },
  { number: "R-000182", date: "05/10/2026", client: "Evento ocasional", units: 8, kg: "58,410", subtotal: "$1.621.900", discount: "Sin descuento", total: "$1.621.900", status: "Confirmado" },
];

function Remittances() {
  const [selected, setSelected] = useState<(typeof remittanceRows)[number] | null>(null);
  return (
    <section className="rounded-[26px] border bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="text-2xl font-black">Remitos</h2>
        <p className="text-sm text-muted-foreground">Historial, detalle, descuentos y reimpresión.</p>
      </div>
      <div className="overflow-hidden rounded-2xl border">
        <Table>
          <TableHeader className="bg-[#fff4f8]">
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Unidades</TableHead>
              <TableHead>Kg</TableHead>
              <TableHead>Descuento</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {remittanceRows.map((remittance) => (
              <TableRow key={remittance.number}>
                <TableCell className="font-mono font-bold">{remittance.number}</TableCell>
                <TableCell>{remittance.date}</TableCell>
                <TableCell className="font-bold">{remittance.client}</TableCell>
                <TableCell>{remittance.units}</TableCell>
                <TableCell>{remittance.kg}</TableCell>
                <TableCell>{remittance.discount}</TableCell>
                <TableCell className="text-right font-black">{remittance.total}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setSelected(remittance)}>Ver remito</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="print-remittance-dialog max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Remito {selected.number}</DialogTitle>
                <DialogDescription>{selected.client} · {selected.date}</DialogDescription>
              </DialogHeader>
              <div id="print-remittance" className="rounded-2xl border bg-white p-5 text-black">
                <div className="flex items-start justify-between border-b pb-4">
                  <div className="relative h-10 w-56 overflow-hidden">
                    <Image
                      src="/munna-laboratorio.jpg"
                      fill
                      sizes="224px"
                      alt="Münna"
                      className="logo-monochrome object-cover"
                      style={{ objectPosition: "center 42%" }}
                    />
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{selected.status}</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Código</TableHead><TableHead>Producto</TableHead><TableHead>Peso / cantidad</TableHead><TableHead>Descuento</TableHead><TableHead className="text-right">Importe final</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow><TableCell>004529</TableCell><TableCell>Chocolate Münna B.G</TableCell><TableCell>7,155 kg netos</TableCell><TableCell>50% · Helados</TableCell><TableCell className="text-right">$96.593</TableCell></TableRow>
                    <TableRow><TableCell>004530</TableCell><TableCell>Pistacho B.G</TableCell><TableCell>7,080 kg netos</TableCell><TableCell>50% · Helados</TableCell><TableCell className="text-right">$106.200</TableCell></TableRow>
                    <TableRow><TableCell>004531</TableCell><TableCell>Frutilla a la Crema B.C</TableCell><TableCell>3,620 kg netos</TableCell><TableCell>50% · Helados</TableCell><TableCell className="text-right">$48.870</TableCell></TableRow>
                    <TableRow><TableCell>1201</TableCell><TableCell>Cuadrado Delicioso Brownie</TableCell><TableCell>10 cajas</TableCell><TableCell>30% · Pastelería</TableCell><TableCell className="text-right">$31.500</TableCell></TableRow>
                  </TableBody>
                </Table>
                <div className="ml-auto mt-5 max-w-sm space-y-2 text-sm">
                  <div className="flex justify-between"><span>Subtotal</span><b>{selected.subtotal}</b></div>
                  <div className="flex justify-between"><span>Descuentos aplicados</span><b>{selected.discount}</b></div>
                  <div className="flex justify-between border-t pt-3 text-lg"><span>Total</span><b>{selected.total}</b></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>Cerrar</Button>
                <Button onClick={() => window.print()} className="bg-[#3c2931] text-white"><Printer /> Imprimir remito</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function StaffManagement({ staff, setStaff }: { staff: StaffMember[]; setStaff: StateDispatch<SetStateAction<StaffMember[]>> }) {
  const [editing, setEditing] = useState<Partial<StaffMember> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const roleLabel = (role: StaffMember["role"]) => role === "administracion" ? "Administración" : role === "encargado" ? "Jefe de Producción" : "Maestro Heladero";
  const save = async () => {
    if (!editing?.displayName || !editing.email) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-staff", staff: { ...editing, role: editing.role ?? "produccion", active: editing.active !== false } }) });
      const result = await response.json() as { staff?: StaffMember[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar el personal.");
      setStaff(result.staff ?? []); setEditing(null);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el personal."); }
    finally { setSaving(false); }
  };
  return <section className="space-y-5">
    <div className="flex flex-col gap-4 rounded-3xl border bg-white p-6 shadow-sm sm:flex-row sm:items-end sm:justify-between"><div><Badge className="bg-[#f4d5e1] text-[#983f62]">Accesos</Badge><h2 className="mt-3 text-3xl font-black">Personal y permisos</h2><p className="mt-1 text-muted-foreground">Definí quién puede operar y qué información puede ver.</p></div><Button onClick={() => setEditing({ displayName: "", email: "", role: "produccion", active: true })} className="rounded-xl bg-[#3b2931] text-white"><Plus /> Agregar personal</Button></div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
    <div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><Table><TableHeader><TableRow><TableHead>Persona</TableHead><TableHead>Correo de acceso</TableHead><TableHead>Rol</TableHead><TableHead>Puede ver</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow></TableHeader><TableBody>{staff.map((member) => <TableRow key={member.id}><TableCell className="font-bold">{member.displayName}</TableCell><TableCell>{member.email}</TableCell><TableCell><Badge variant="outline">{roleLabel(member.role)}</Badge></TableCell><TableCell className="text-sm text-muted-foreground">{member.role === "administracion" ? "Todo, incluidos costos y cuentas corrientes" : member.role === "encargado" ? "Producción, stock, despachos y remitos" : "Producción y stock"}</TableCell><TableCell><Badge className={member.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>{member.active ? "Activo" : "Inactivo"}</Badge></TableCell><TableCell className="text-right"><Button variant="ghost" onClick={() => setEditing(member)}>Editar</Button></TableCell></TableRow>)}</TableBody></Table></div>
    <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>{editing?.id ? "Editar integrante" : "Agregar personal"}</DialogTitle><DialogDescription>El correo debe coincidir con el que la persona usa para ingresar.</DialogDescription></DialogHeader>{editing && <div className="grid gap-4 py-2"><label className="space-y-2 text-sm font-bold">Nombre y apellido<Input value={editing.displayName ?? ""} onChange={(event) => setEditing({ ...editing, displayName: event.target.value })}/></label><label className="space-y-2 text-sm font-bold">Correo<Input type="email" value={editing.email ?? ""} onChange={(event) => setEditing({ ...editing, email: event.target.value })}/></label><label className="space-y-2 text-sm font-bold">Rol<select value={editing.role ?? "produccion"} onChange={(event) => setEditing({ ...editing, role: event.target.value as StaffMember["role"] })} className="h-10 w-full rounded-md border bg-white px-3 font-normal"><option value="produccion">Producción</option><option value="encargado">Encargado</option><option value="administracion">Administración</option></select></label><label className="flex items-center justify-between rounded-xl border p-3 text-sm font-bold">Usuario activo<Switch checked={editing.active !== false} onCheckedChange={(checked) => setEditing({ ...editing, active: checked })}/></label></div>}<div className="rounded-2xl bg-[#fff4f8] p-4 text-sm"><b>Producción:</b> no ve precios, costos ni cuentas corrientes.<br/><b>Encargado:</b> puede despachar y consultar remitos.<br/><b>Administración:</b> tiene acceso completo.</div><DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button disabled={saving} onClick={save} className="bg-[#3b2931] text-white">{saving ? "Guardando…" : "Guardar personal"}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}

type CustomerDispatch = { id: number; remittanceNumber: string; clientId: number; clientName: string; totalKg: number; total: number; createdAt: string };
type CustomerPayment = { id: number; clientId: number; clientName: string; paymentDate: string; amount: number; method: string; reference: string | null; notes: string | null; createdAt: string };
type CustomerAdjustment = { id: number; clientId: number; clientName: string; movementDate: string; movementType: string; concept: string; signedAmount: number; notes: string | null; createdAt: string };

function CustomerAccounts({ clients }: { clients: Client[] }) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? 0);
  const [dispatchRows, setDispatchRows] = useState<CustomerDispatch[]>([]);
  const [paymentRows, setPaymentRows] = useState<CustomerPayment[]>([]);
  const [adjustmentRows, setAdjustmentRows] = useState<CustomerAdjustment[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [payment, setPayment] = useState({ amount: "", method: "Transferencia", reference: "", notes: "", paymentDate: new Date().toISOString().slice(0, 10) });
  const [adjustment, setAdjustment] = useState({ movementType: "Venta", concept: "Regalía mensual", amount: "", effect: "increase", notes: "", movementDate: new Date().toISOString().slice(0, 10) });
  const selectedClient = clients.find((client) => client.id === clientId) ?? clients[0];
  const loadAccount = async () => {
    const response = await fetch("/api/operations");
    const data = await response.json() as { recentDispatches?: CustomerDispatch[]; customerPayments?: CustomerPayment[]; customerAdjustments?: CustomerAdjustment[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "No se pudo cargar la cuenta corriente.");
    setDispatchRows(data.recentDispatches ?? []);
    setPaymentRows(data.customerPayments ?? []);
    setAdjustmentRows(data.customerAdjustments ?? []);
  };
  useEffect(() => { loadAccount().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la cuenta corriente.")); }, []);
  const clientDispatches = dispatchRows.filter((row) => row.clientId === clientId || row.clientName === selectedClient?.name);
  const clientPayments = paymentRows.filter((row) => row.clientId === clientId || row.clientName === selectedClient?.name);
  const clientAdjustments = adjustmentRows.filter((row) => row.clientId === clientId || row.clientName === selectedClient?.name);
  const adjustmentsTotal = clientAdjustments.reduce((sum, row) => sum + Number(row.signedAmount), 0);
  const invoiced = clientDispatches.reduce((sum, row) => sum + Number(row.total), 0) + adjustmentsTotal;
  const collected = clientPayments.reduce((sum, row) => sum + Number(row.amount), 0);
  const balance = invoiced - collected;
  const movements = [
    ...clientDispatches.map((row) => ({ key: `d-${row.id}`, date: row.createdAt, detail: `Remito ${row.remittanceNumber}`, debit: Number(row.total), credit: 0, note: `${Number(row.totalKg).toLocaleString("es-AR", { minimumFractionDigits: 3 })} kg` })),
    ...clientPayments.map((row) => ({ key: `p-${row.id}`, date: row.paymentDate, detail: `Pago · ${row.method}`, debit: 0, credit: Number(row.amount), note: row.reference || row.notes || "Sin referencia" })),
    ...clientAdjustments.map((row) => ({ key: `a-${row.id}`, date: row.movementDate, detail: `${row.movementType} · ${row.concept}`, debit: row.signedAmount > 0 ? Number(row.signedAmount) : 0, credit: row.signedAmount < 0 ? Math.abs(Number(row.signedAmount)) : 0, note: row.notes || (row.signedAmount > 0 ? "Aumenta el saldo" : "Disminuye el saldo") })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const savePayment = async () => {
    if (!selectedClient || !Number(payment.amount.replace(/\D/g, ""))) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register-customer-payment", payment: { clientId: selectedClient.id, clientName: selectedClient.name, amount: Number(payment.amount.replace(/\D/g, "")), method: payment.method, reference: payment.reference, notes: payment.notes, paymentDate: payment.paymentDate } }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo registrar el pago.");
      await loadAccount();
      setPaymentOpen(false);
      setPayment({ amount: "", method: "Transferencia", reference: "", notes: "", paymentDate: new Date().toISOString().slice(0, 10) });
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "No se pudo registrar el pago."); }
    finally { setSaving(false); }
  };
  const saveAdjustment = async () => {
    if (!selectedClient || !adjustment.concept || !Number(adjustment.amount.replace(/\D/g, ""))) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register-customer-adjustment", movement: { ...adjustment, clientId: selectedClient.id, clientName: selectedClient.name, amount: Number(adjustment.amount.replace(/\D/g, "")) } }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo registrar el movimiento.");
      await loadAccount(); setAdjustmentOpen(false);
      setAdjustment({ movementType: "Venta", concept: "Regalía mensual", amount: "", effect: "increase", notes: "", movementDate: new Date().toISOString().slice(0, 10) });
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "No se pudo registrar el movimiento."); }
    finally { setSaving(false); }
  };
  return <section className="space-y-5">
    <div className="flex flex-col gap-4 rounded-3xl border bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
      <div><Badge className="bg-[#f4d5e1] text-[#983f62]">Administración</Badge><h2 className="mt-3 text-3xl font-black">Cuenta corriente de clientes</h2><p className="mt-1 text-muted-foreground">Remitos enviados, cobros recibidos y saldo pendiente de cada cliente.</p></div>
      <div className="flex flex-col gap-2 sm:flex-row"><select value={clientId} onChange={(event) => setClientId(Number(event.target.value))} className="h-11 min-w-64 rounded-xl border bg-white px-3 font-bold">{clients.filter((client) => client.active).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><Button variant="outline" onClick={() => setAdjustmentOpen(true)} className="h-11 rounded-xl"><Plus /> Nueva venta / ajuste</Button><Button onClick={() => setPaymentOpen(true)} className="h-11 rounded-xl bg-[#3b2931] text-white"><Plus /> Registrar cobro</Button></div>
    </div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-sm font-bold text-muted-foreground">Remitos enviados</p><p className="mt-2 text-3xl font-black">{money(invoiced)}</p><p className="mt-2 text-xs text-muted-foreground">{clientDispatches.length} movimientos</p></div><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-sm font-bold text-muted-foreground">Pagos recibidos</p><p className="mt-2 text-3xl font-black text-emerald-700">{money(collected)}</p><p className="mt-2 text-xs text-muted-foreground">{clientPayments.length} cobros registrados</p></div><div className={`rounded-3xl p-5 text-white shadow-sm ${balance > 0 ? "bg-[#3b2931]" : "bg-emerald-700"}`}><p className="text-sm font-bold text-white/70">Saldo actual</p><p className="mt-2 text-3xl font-black">{money(balance)}</p><p className="mt-2 text-xs text-white/70">{balance > 0 ? "El cliente debe a Münna" : balance < 0 ? "Saldo a favor del cliente" : "Cuenta al día"}</p></div></div>
    <div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b p-5"><h3 className="text-xl font-black">Movimientos de {selectedClient?.name}</h3><p className="text-sm text-muted-foreground">Los remitos suman deuda y los pagos la descuentan.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Movimiento</TableHead><TableHead>Detalle</TableHead><TableHead className="text-right">Debe</TableHead><TableHead className="text-right">Haber</TableHead></TableRow></TableHeader><TableBody>{movements.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Todavía no hay movimientos para este cliente.</TableCell></TableRow>}{movements.map((row) => <TableRow key={row.key}><TableCell>{new Date(row.date).toLocaleDateString("es-AR")}</TableCell><TableCell className="font-bold">{row.detail}</TableCell><TableCell className="text-muted-foreground">{row.note}</TableCell><TableCell className="text-right text-rose-700">{row.debit ? money(row.debit) : "—"}</TableCell><TableCell className="text-right text-emerald-700">{row.credit ? money(row.credit) : "—"}</TableCell></TableRow>)}</TableBody></Table></div></div>
    <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}><DialogContent className="sm:max-w-[620px]"><DialogHeader><DialogTitle>Registrar cobro de cliente</DialogTitle><DialogDescription>El importe se descontará automáticamente del saldo de {selectedClient?.name}.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><label className="space-y-2 text-sm font-bold">Fecha<Input type="date" value={payment.paymentDate} onChange={(event) => setPayment({ ...payment, paymentDate: event.target.value })}/></label><label className="space-y-2 text-sm font-bold">Monto recibido<Input value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} inputMode="numeric" placeholder="$ 0"/></label><label className="space-y-2 text-sm font-bold">Forma de pago<select value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })} className="h-9 w-full rounded-md border bg-transparent px-3 font-normal">{["Transferencia", "Efectivo", "Echeq", "Cheque de tercero", "Mercadería"].map((method) => <option key={method}>{method}</option>)}</select></label><label className="space-y-2 text-sm font-bold">Referencia<Input value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} placeholder="Transferencia, recibo o cheque"/></label><label className="space-y-2 text-sm font-bold sm:col-span-2">Observaciones<Textarea value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })} placeholder="Pago total, parcial u observaciones"/></label></div><div className="rounded-2xl bg-[#f7f3f5] p-4 text-sm"><div className="flex justify-between"><span>Saldo actual</span><b>{money(balance)}</b></div><div className="mt-2 flex justify-between border-t pt-2"><span>Saldo luego del cobro</span><b>{money(balance - (Number(payment.amount.replace(/\D/g, "")) || 0))}</b></div></div><DialogFooter><Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancelar</Button><Button disabled={saving} onClick={savePayment} className="bg-[#3b2931] text-white">{saving ? "Guardando…" : "Registrar cobro"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={adjustmentOpen} onOpenChange={setAdjustmentOpen}><DialogContent className="sm:max-w-[620px]"><DialogHeader><DialogTitle>Nueva venta o ajuste</DialogTitle><DialogDescription>Registrá regalías, ventas adicionales, bonificaciones o correcciones de saldo.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><label className="space-y-2 text-sm font-bold">Fecha<Input type="date" value={adjustment.movementDate} onChange={(event) => setAdjustment({ ...adjustment, movementDate: event.target.value })}/></label><label className="space-y-2 text-sm font-bold">Tipo<select value={adjustment.movementType} onChange={(event) => setAdjustment({ ...adjustment, movementType: event.target.value })} className="h-9 w-full rounded-md border bg-white px-3 font-normal"><option>Venta</option><option>Ajuste</option></select></label><label className="space-y-2 text-sm font-bold sm:col-span-2">Concepto<Input value={adjustment.concept} onChange={(event) => setAdjustment({ ...adjustment, concept: event.target.value })} placeholder="Ej. Regalía septiembre 2026"/></label><label className="space-y-2 text-sm font-bold">Importe<Input value={adjustment.amount} onChange={(event) => setAdjustment({ ...adjustment, amount: event.target.value })} inputMode="numeric" placeholder="$ 0"/></label><label className="space-y-2 text-sm font-bold">Efecto en la cuenta<select value={adjustment.effect} onChange={(event) => setAdjustment({ ...adjustment, effect: event.target.value })} className="h-9 w-full rounded-md border bg-white px-3 font-normal"><option value="increase">Positivo · aumenta la deuda</option><option value="decrease">Negativo · disminuye la deuda</option></select></label><label className="space-y-2 text-sm font-bold sm:col-span-2">Observaciones<Textarea value={adjustment.notes} onChange={(event) => setAdjustment({ ...adjustment, notes: event.target.value })} placeholder="Detalle o período de la regalía"/></label></div><div className="rounded-2xl bg-[#f7f3f5] p-4 text-sm"><div className="flex justify-between"><span>Saldo actual</span><b>{money(balance)}</b></div><div className="mt-2 flex justify-between border-t pt-2"><span>Saldo después del movimiento</span><b>{money(balance + (adjustment.effect === "decrease" ? -1 : 1) * (Number(adjustment.amount.replace(/\D/g, "")) || 0))}</b></div></div><DialogFooter><Button variant="outline" onClick={() => setAdjustmentOpen(false)}>Cancelar</Button><Button disabled={saving} onClick={saveAdjustment} className="bg-[#3b2931] text-white">{saving ? "Guardando…" : "Registrar movimiento"}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}

type FinancialExpense = { id: number; expenseDate: string; area: string; category: string; concept: string; amount: number; notes: string | null };
type LocalSale = { id: number; saleDate: string; area: string; concept: string; amount: number; notes: string | null };
type FinancialPurchase = { id: number; invoiceDate: string; costCenter: string; grossTotal: number };
type FinancialDispatch = { id: number; createdAt: string; total: number };

function ProfitAndLoss() {
  const today = new Date().toISOString().slice(0, 10);
  const [year, setYear] = useState(Number(today.slice(0, 4))), [area, setArea] = useState("Fábrica");
  const [expenses, setExpenses] = useState<FinancialExpense[]>([]), [sales, setSales] = useState<LocalSale[]>([]), [purchaseRows, setPurchaseRows] = useState<FinancialPurchase[]>([]), [dispatchRows, setDispatchRows] = useState<FinancialDispatch[]>([]), [adjustments, setAdjustments] = useState<CustomerAdjustment[]>([]);
  const [saleOpen, setSaleOpen] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const [sale, setSale] = useState({ saleDate: today, area: "Av. de Mayo", concept: "Venta diaria", amount: "", notes: "" });
  const load = async () => { const response = await fetch("/api/operations"); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "No se pudo cargar el estado de resultados."); setExpenses(data.operatingExpenses ?? []); setSales(data.localSales ?? []); setPurchaseRows(data.purchases ?? []); setDispatchRows(data.financialDispatches ?? []); setAdjustments(data.customerAdjustments ?? []); };
  useEffect(() => { load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "No se pudo cargar.")); }, []);
  const months = Array.from({ length: 12 }, (_, month) => ({
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    label: new Date(year, month, 1).toLocaleDateString("es-AR", { month: "short" }).replace(".", "").toUpperCase(),
  }));
  const categories = ["Servicios", "Alquileres", "Sueldos", "Mantenimiento", "Logística", "Impuestos", "Otros"];
  const monthly = months.map((month) => {
    const matches = (date: string) => date.slice(0, 7) === month.key;
    const revenue = area === "Fábrica"
      ? dispatchRows.filter((row) => matches(row.createdAt)).reduce((sum, row) => sum + Number(row.total), 0)
        + adjustments.filter((row) => row.signedAmount > 0 && matches(row.movementDate)).reduce((sum, row) => sum + Number(row.signedAmount), 0)
      : sales.filter((row) => row.area === area && matches(row.saleDate)).reduce((sum, row) => sum + Number(row.amount), 0);
    const merchandise = purchaseRows.filter((row) => row.costCenter === area && matches(row.invoiceDate)).reduce((sum, row) => sum + Number(row.grossTotal), 0);
    const monthExpenses = expenses.filter((row) => row.area === area && matches(row.expenseDate));
    const byCategory = Object.fromEntries(categories.map((category) => [category, monthExpenses.filter((row) => row.category === category).reduce((sum, row) => sum + Number(row.amount), 0)]));
    const operating = Object.values(byCategory).reduce((sum, value) => sum + Number(value), 0);
    const investments = monthExpenses.filter((row) => row.category === "Inversiones").reduce((sum, row) => sum + Number(row.amount), 0);
    return { ...month, revenue, merchandise, byCategory, operating, investments, result: revenue - merchandise - operating };
  });
  const yearRevenue = monthly.reduce((sum, row) => sum + row.revenue, 0);
  const yearCosts = monthly.reduce((sum, row) => sum + row.merchandise + row.operating, 0);
  const yearResult = yearRevenue - yearCosts;
  const latestWithData = [...monthly].reverse().find((row) => row.revenue || row.merchandise || row.operating) ?? monthly[new Date().getMonth()];
  const latestIndex = monthly.findIndex((row) => row.key === latestWithData.key);
  const previous = latestIndex > 0 ? monthly[latestIndex - 1] : undefined;
  const change = (current: number, prior?: number) => prior ? (current / prior - 1) * 100 : null;
  const currentChange = change(latestWithData.revenue, previous?.revenue);
  const areaExpenses = expenses.filter((row) => row.area === area && row.expenseDate.slice(0, 4) === String(year));
  const saveSale = async () => { const amount = Number(sale.amount.replace(/\D/g, "")); if (!amount) return; setSaving(true); setError(""); try { const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register-local-sale", sale: { ...sale, amount } }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "No se pudo guardar."); await load(); setSaleOpen(false); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "No se pudo guardar."); } finally { setSaving(false); } };
  const rows: Array<{ label: string; values: Array<number | null>; tone?: string; bold?: boolean; percent?: boolean; muted?: boolean; indent?: boolean }> = [
    { label: "VENTAS TOTALES", values: monthly.map((row) => row.revenue), tone: "bg-[#3b2931] text-white", bold: true },
    { label: "% VAR. MES ANTERIOR", values: monthly.map((row, index) => index ? change(row.revenue, monthly[index - 1].revenue) : null), percent: true, tone: "bg-[#f7f0f3] text-[#983f62]" },
    { label: "COSTO DE MERCADERÍA", values: monthly.map((row) => row.merchandise), bold: true },
    { label: "% SOBRE VENTAS", values: monthly.map((row) => row.revenue ? row.merchandise / row.revenue * 100 : null), percent: true, muted: true },
    ...categories.flatMap((category) => [
      { label: category.toUpperCase(), values: monthly.map((row) => Number(row.byCategory[category])), indent: true },
      { label: `% ${category.toUpperCase()} / VENTAS`, values: monthly.map((row) => row.revenue ? Number(row.byCategory[category]) / row.revenue * 100 : null), percent: true, muted: true, indent: true },
    ]),
    { label: "GASTOS OPERATIVOS", values: monthly.map((row) => row.operating), tone: "bg-[#f7f0f3]", bold: true },
    { label: "% GASTOS / VENTAS", values: monthly.map((row) => row.revenue ? row.operating / row.revenue * 100 : null), percent: true, tone: "bg-[#f7f0f3]", bold: true },
    { label: "RESULTADO OPERATIVO", values: monthly.map((row) => row.result), tone: "bg-[#3b2931] text-white", bold: true },
    { label: "MARGEN", values: monthly.map((row) => row.revenue ? row.result / row.revenue * 100 : null), percent: true, tone: "bg-[#3b2931] text-white", bold: true },
    { label: "INVERSIONES", values: monthly.map((row) => row.investments), tone: "bg-amber-50", bold: true },
  ];
  return <section className="space-y-5"><div className="flex flex-col gap-4 rounded-3xl border bg-white p-6 shadow-sm xl:flex-row xl:items-end xl:justify-between"><div><Badge className="bg-[#f4d5e1] text-[#983f62]">Administración</Badge><h2 className="mt-3 text-3xl font-black">Estado de resultados</h2><p className="mt-1 text-muted-foreground">Comparativo mensual inspirado en tu RTO económico. Los gastos se cargan desde Costos.</p></div><div className="flex flex-wrap gap-2"><select value={area} onChange={(event) => setArea(event.target.value)} className="h-10 rounded-md border bg-white px-3 font-bold">{["Fábrica", "Av. de Mayo", "Centenario"].map((item) => <option key={item}>{item}</option>)}</select><select value={year} onChange={(event) => setYear(Number(event.target.value))} className="h-10 rounded-md border bg-white px-3 font-bold">{[year - 2, year - 1, year, year + 1].map((item) => <option key={item}>{item}</option>)}</select>{area !== "Fábrica" && <Button onClick={() => { setSale({ ...sale, area }); setSaleOpen(true); }} className="bg-[#3b2931] text-white"><Plus/> Cargar venta</Button>}</div></div>{error && <div className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Ventas del año", yearRevenue, `${area} · ${year}`],["Costos del año", yearCosts, "Mercadería + gastos operativos"],[`Ventas ${latestWithData.label}`, latestWithData.revenue, currentChange === null ? "Sin mes anterior comparable" : `${currentChange >= 0 ? "+" : ""}${currentChange.toFixed(1)}% vs. ${previous?.label}`],["Resultado del año", yearResult, yearRevenue ? `Margen ${(yearResult / yearRevenue * 100).toFixed(1)}%` : "Sin ventas cargadas"]].map(([label,value,note], index) => <div key={String(label)} className={`rounded-3xl p-5 shadow-sm ${index === 3 ? (Number(value) >= 0 ? "bg-emerald-700 text-white" : "bg-rose-700 text-white") : "border bg-white"}`}><p className={`text-sm font-bold ${index === 3 ? "text-white/70" : "text-muted-foreground"}`}>{label}</p><p className="mt-2 text-3xl font-black">{money(Number(value))}</p><p className={`mt-2 text-xs ${index === 3 ? "text-white/70" : "text-muted-foreground"}`}>{note}</p></div>)}</div>
    <div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="flex flex-col gap-2 border-b p-5 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-xl font-black">RTO económico · {area}</h3><p className="text-sm text-muted-foreground">Mes contra mes · importes en pesos · desplazá la tabla para ver todo el año.</p></div><Badge variant="outline">Enero — Diciembre {year}</Badge></div><div className="overflow-x-auto"><table className="w-full min-w-[1450px] border-collapse text-sm"><thead><tr className="bg-[#eadde3]"><th className="sticky left-0 z-20 min-w-64 border-b border-r bg-[#eadde3] px-4 py-3 text-left font-black">CONCEPTO</th>{months.map((month) => <th key={month.key} className="min-w-24 border-b px-3 py-3 text-right font-black">{month.label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.label} className={row.tone ?? "hover:bg-slate-50"}><td className={`sticky left-0 z-10 border-b border-r px-4 py-2.5 ${row.tone ?? "bg-white"} ${row.bold ? "font-black" : "font-medium"} ${row.indent ? "pl-8" : ""}`}>{row.label}</td>{row.values.map((value, index) => <td key={months[index].key} className={`border-b px-3 py-2.5 text-right tabular-nums ${row.bold ? "font-black" : ""} ${row.muted ? "text-xs text-muted-foreground" : ""}`}>{value === null || Number.isNaN(value) ? "—" : row.percent ? `${Number(value).toFixed(1)}%` : money(Number(value))}</td>)}</tr>)}</tbody></table></div></div>
    <div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b p-5"><h3 className="text-xl font-black">Detalle de gastos · {year}</h3><p className="text-sm text-muted-foreground">Comprobantes que alimentan automáticamente el comparativo.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Categoría</TableHead><TableHead>Concepto</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader><TableBody>{areaExpenses.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No hay gastos cargados para este año.</TableCell></TableRow>}{areaExpenses.map((row) => <TableRow key={row.id}><TableCell>{new Date(row.expenseDate).toLocaleDateString("es-AR")}</TableCell><TableCell><Badge variant="outline">{row.category}</Badge></TableCell><TableCell className="font-bold">{row.concept}</TableCell><TableCell className="text-right">{money(row.amount)}</TableCell></TableRow>)}</TableBody></Table></div></div>
    <Dialog open={saleOpen} onOpenChange={setSaleOpen}><DialogContent><DialogHeader><DialogTitle>Cargar venta del local</DialogTitle><DialogDescription>Ingresá la facturación para incorporarla al resultado del local.</DialogDescription></DialogHeader><div className="grid gap-4"><label className="space-y-2 text-sm font-bold">Fecha<Input type="date" value={sale.saleDate} onChange={(e)=>setSale({...sale,saleDate:e.target.value})}/></label><label className="space-y-2 text-sm font-bold">Concepto<Input value={sale.concept} onChange={(e)=>setSale({...sale,concept:e.target.value})}/></label><label className="space-y-2 text-sm font-bold">Importe<Input value={sale.amount} onChange={(e)=>setSale({...sale,amount:e.target.value})} inputMode="numeric"/></label><label className="space-y-2 text-sm font-bold">Observaciones<Textarea value={sale.notes} onChange={(e)=>setSale({...sale,notes:e.target.value})}/></label></div><DialogFooter><Button variant="outline" onClick={()=>setSaleOpen(false)}>Cancelar</Button><Button disabled={saving} onClick={saveSale} className="bg-[#3b2931] text-white">Guardar venta</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}

type CostTab = "resumen" | "compras" | "gastos" | "iva" | "pagos" | "proveedores" | "materias" | "formulas";

const costCenters = [
  { name: "Fábrica", amount: 18432540, tone: "bg-[#3b2931]" },
  { name: "Av. de Mayo", amount: 8294780, tone: "bg-[#c45c82]" },
  { name: "Logística", amount: 2145600, tone: "bg-[#64748b]" },
  { name: "Administración", amount: 1768920, tone: "bg-[#a78b75]" },
];

const initialPurchaseRows = [
  { date: "13/10/2026", invoice: "FC A 0004-1842", supplier: "Vacalin", detail: "3 productos", center: "Fábrica", net: 1240000, vat21: 260400, vat105: 0, tax: 260400, total: 1500400, status: "Cuenta corriente" },
  { date: "12/10/2026", invoice: "FC B 0002-9811", supplier: "Cooperativa Eléctrica", detail: "Energía septiembre", center: "Fábrica", net: 1064000, vat21: 223440, vat105: 0, tax: 223440, total: 1287440, status: "Pagado" },
  { date: "11/10/2026", invoice: "T 084521", supplier: "YPF", detail: "Combustible reparto", center: "Logística", net: 118000, vat21: 24780, vat105: 0, tax: 24780, total: 142780, status: "Pagado" },
  { date: "10/10/2026", invoice: "FC A 0001-4430", supplier: "Distribuidora Centro", detail: "2 productos", center: "Fábrica", net: 160181, vat21: 0, vat105: 16819, tax: 16819, total: 177000, status: "Cuenta corriente" },
];

const supplierProfiles = [
  { name: "Vacalin", taxMode: "Con IVA", debt: 3258040, invoices: "2 facturas", date: "13/10/26" },
  { name: "Distribuidora Centro", taxMode: "Con IVA", debt: 847500, invoices: "3 facturas", date: "10/10/26" },
  { name: "Mapsa", taxMode: "Con IVA", debt: 0, invoices: "Al día", date: "03/10/26" },
  { name: "Proveedor informal", taxMode: "Sin IVA", debt: 0, invoices: "Pago contado", date: "01/10/26" },
];

const initialPaymentRows = [
  { date: "13/10/2026", supplier: "Vacalin", amount: 1000000, method: "Transferencia", reference: "TR 184205", note: "Pago a cuenta" },
  { date: "10/10/2026", supplier: "Distribuidora Centro", amount: 450000, method: "Efectivo", reference: "REC 0048", note: "Pago parcial" },
  { date: "06/10/2026", supplier: "Vacalin", amount: 750000, method: "Echeq", reference: "ECHK 9321", note: "Vto. 20/10/26" },
];

const vacalinLedger = [
  { date: "01/10/26", detail: "Saldo anterior", debit: 0, credit: 0, balance: 2507640 },
  { date: "06/10/26", detail: "Pago · Echeq ECHK 9321", debit: 0, credit: 750000, balance: 1757640 },
  { date: "09/10/26", detail: "FC A 0004-1819", debit: 2000000, credit: 0, balance: 3757640 },
  { date: "13/10/26", detail: "Pago · Transferencia TR 184205", debit: 0, credit: 1000000, balance: 2757640 },
  { date: "13/10/26", detail: "FC A 0004-1842", debit: 500400, credit: 0, balance: 3258040 },
];

const rawMaterials = [
  { name: "Leche entera", unit: "litro", pack: "Caja x 12 l", vat: 10.5, cost: 1475, previous: 1390, supplier: "Distribuidora Centro", date: "10/10/26" },
  { name: "Crema heladera 39%", unit: "litro", pack: "Bidón x 10 l", vat: 21, cost: 5000, previous: 4780, supplier: "Vacalin", date: "13/10/26" },
  { name: "Azúcar", unit: "kg", pack: "Bolsa x 25 kg", vat: 21, cost: 1048, previous: 1010, supplier: "Cañuelas", date: "07/10/26" },
  { name: "Dulce de leche repostero", unit: "kg", pack: "Balde x 10 kg", vat: 21, cost: 5280, previous: 5150, supplier: "Vacalin", date: "06/10/26" },
  { name: "Chocolate cobertura", unit: "kg", pack: "Caja x 5 kg", vat: 21, cost: 13940, previous: 12900, supplier: "Mapsa", date: "03/10/26" },
];

const flavorCosts = [
  { name: "Chocolate Münna", batch: "60 kg", ingredients: 9, recipe: 348420, perKg: 5807, updated: "13/10/26" },
  { name: "Dulce de leche Münna", batch: "60 kg", ingredients: 8, recipe: 314160, perKg: 5236, updated: "13/10/26" },
  { name: "Pistacho", batch: "60 kg", ingredients: 10, recipe: 512880, perKg: 8548, updated: "13/10/26" },
  { name: "Frutilla a la crema", batch: "60 kg", ingredients: 8, recipe: 287640, perKg: 4794, updated: "13/10/26" },
];

const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);

function Costs({ initialPurchaseOpen = false }: { initialPurchaseOpen?: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<CostTab>("resumen");
  const [purchaseOpen, setPurchaseOpen] = useState(initialPurchaseOpen);
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState("");
  const [expenseRows, setExpenseRows] = useState<FinancialExpense[]>([]);
  const [purchases, setPurchases] = useState(initialPurchaseRows);
  const [payments, setPayments] = useState(initialPaymentRows);
  const [purchase, setPurchase] = useState({ supplier: "Vacalin", invoice: "", center: "Fábrica", payment: "Cuenta corriente" });
  const [payment, setPayment] = useState({ supplier: "Vacalin", amount: "", method: "Transferencia", reference: "", note: "" });
  const [expense, setExpense] = useState({ expenseDate: today, area: "Fábrica", category: "Servicios", concept: "", amount: "", notes: "" });
  const [invoiceLines, setInvoiceLines] = useState([{ product: "Crema heladera 39%", quantity: "1", price: "" }]);
  const tabs: [CostTab, string, typeof Calculator][] = [
    ["resumen", "Resumen", LayoutDashboard], ["compras", "Facturas", PackagePlus], ["gastos", "Gastos generales", Calculator], ["iva", "IVA fiscal", FileText], ["pagos", "Pagos", WalletCards],
    ["proveedores", "Proveedores", WalletCards], ["materias", "Materias primas", Boxes],
    ["formulas", "Fórmulas", FlaskConical],
  ];
  const total = costCenters.reduce((sum, item) => sum + item.amount, 0);
  const activeSupplier = supplierProfiles.find((supplier) => supplier.name === purchase.supplier) ?? supplierProfiles[0];
  const invoiceNet = invoiceLines.reduce((sum, line) => sum + (Number(line.quantity.replace(",", ".")) || 0) * (Number(line.price.replace(/\D/g, "")) || 0), 0);
  const invoiceTax = activeSupplier.taxMode === "Con IVA" ? invoiceLines.reduce((sum, line) => {
    const product = rawMaterials.find((item) => item.name === line.product);
    const subtotal = (Number(line.quantity.replace(",", ".")) || 0) * (Number(line.price.replace(/\D/g, "")) || 0);
    return sum + subtotal * ((product?.vat ?? 21) / 100);
  }, 0) : 0;
  const invoiceVat21 = activeSupplier.taxMode === "Con IVA" ? invoiceLines.reduce((sum, line) => { const product = rawMaterials.find((item) => item.name === line.product); const subtotal = (Number(line.quantity.replace(",", ".")) || 0) * (Number(line.price.replace(/\D/g, "")) || 0); return sum + (product?.vat === 21 ? subtotal * .21 : 0); }, 0) : 0;
  const invoiceVat105 = activeSupplier.taxMode === "Con IVA" ? invoiceLines.reduce((sum, line) => { const product = rawMaterials.find((item) => item.name === line.product); const subtotal = (Number(line.quantity.replace(",", ".")) || 0) * (Number(line.price.replace(/\D/g, "")) || 0); return sum + (product?.vat === 10.5 ? subtotal * .105 : 0); }, 0) : 0;
  const monthlyVat21 = purchases.reduce((sum, row) => sum + row.vat21, 0);
  const monthlyVat105 = purchases.reduce((sum, row) => sum + row.vat105, 0);
  const expenseCategories = ["Servicios", "Alquileres", "Sueldos", "Mantenimiento", "Logística", "Impuestos", "Otros", "Inversiones"];
  useEffect(() => {
    fetch("/api/operations").then(async (response) => {
      const data = await response.json() as { operatingExpenses?: FinancialExpense[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "No se pudieron cargar los gastos.");
      setExpenseRows(data.operatingExpenses ?? []);
    }).catch((loadError) => setExpenseError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los gastos."));
  }, []);
  const saveExpense = async () => {
    const amount = Number(expense.amount.replace(/\D/g, ""));
    if (!amount || !expense.concept.trim()) return;
    setSavingExpense(true); setExpenseError("");
    try {
      const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register-expense", expense: { ...expense, amount } }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "No se pudo guardar el gasto.");
      const refreshed = await fetch("/api/operations");
      const refreshedData = await refreshed.json() as { operatingExpenses?: FinancialExpense[] };
      setExpenseRows(refreshedData.operatingExpenses ?? []);
      setExpenseOpen(false);
      setExpense({ expenseDate: today, area: "Fábrica", category: "Servicios", concept: "", amount: "", notes: "" });
    } catch (saveError) {
      setExpenseError(saveError instanceof Error ? saveError.message : "No se pudo guardar el gasto.");
    } finally { setSavingExpense(false); }
  };
  const savePurchase = async () => {
    if (!purchase.invoice || !invoiceNet) return;
    setSavingPurchase(true);
    setPurchaseError("");
    try {
      const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        action: "register-purchase", purchase, supplierTaxMode: activeSupplier.taxMode,
        lines: invoiceLines.map((line) => { const profile = rawMaterials.find((item) => item.name === line.product) ?? rawMaterials[0]; return { ...line, vatRate: profile.vat, contentPerPackage: Number(profile.pack.match(/[\d,.]+/)?.[0].replace(",", ".") ?? 1), costUnit: profile.unit }; }),
        totals: { net: invoiceNet, vat: invoiceTax, gross: invoiceNet + invoiceTax },
      }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la compra.");
      setPurchases((rows) => [{ date: new Date().toLocaleDateString("es-AR"), invoice: purchase.invoice, supplier: purchase.supplier, detail: `${invoiceLines.length} ${invoiceLines.length === 1 ? "producto" : "productos"}`, center: purchase.center, net: invoiceNet, vat21: invoiceVat21, vat105: invoiceVat105, tax: invoiceTax, total: invoiceNet + invoiceTax, status: purchase.payment }, ...rows]);
      setPurchaseOpen(false);
      setPurchase({ supplier: "Vacalin", invoice: "", center: "Fábrica", payment: "Cuenta corriente" });
      setInvoiceLines([{ product: "Crema heladera 39%", quantity: "1", price: "" }]);
    } catch (error) {
      setPurchaseError(error instanceof Error ? error.message : "No se pudo guardar la compra.");
    } finally {
      setSavingPurchase(false);
    }
  };
  const savePayment = () => {
    const amount = Number(payment.amount.replace(/\D/g, ""));
    if (!amount) return;
    setPayments((rows) => [{ date: "13/10/2026", supplier: payment.supplier, amount, method: payment.method, reference: payment.reference || "Sin referencia", note: payment.note || "Pago a cuenta" }, ...rows]);
    setPaymentOpen(false);
    setPayment({ supplier: "Vacalin", amount: "", method: "Transferencia", reference: "", note: "" });
  };
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><Badge className="rounded-full bg-[#f4d5e1] text-[#983f62] hover:bg-[#f4d5e1]">Administración</Badge><h2 className="mt-3 text-3xl font-black tracking-tight">Costos y rentabilidad</h2><p className="mt-1 text-muted-foreground">Último costo pagado, gastos por centro y costo actualizado de cada sabor.</p></div>
        <Button onClick={() => setPurchaseOpen(true)} className="rounded-xl bg-[#3b2931] text-white"><Plus /> Nueva factura</Button>
      </div>
      <div className="flex gap-2 overflow-x-auto rounded-2xl border bg-white p-2 shadow-sm">
        {tabs.map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === id ? "bg-[#3b2931] text-white" : "text-muted-foreground hover:bg-[#fff1f6]"}`}><Icon className="size-4" />{label}</button>)}
      </div>

      {tab === "resumen" && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {costCenters.map((item) => <div key={item.name} className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div className={`size-3 rounded-full ${item.tone}`} /><span className="text-xs font-semibold text-muted-foreground">OCTUBRE 2026</span></div><p className="mt-5 text-sm font-semibold text-muted-foreground">{item.name}</p><p className="mt-1 text-2xl font-black">{money(item.amount)}</p><p className="mt-2 text-xs text-muted-foreground">{Math.round(item.amount / total * 100)}% del total mensual</p></div>)}
        </div>
        <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
          <div className="rounded-3xl border bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="text-xl font-black">Costos por categoría</h3><p className="text-sm text-muted-foreground">Acumulado del mes en todos los centros</p></div><Badge variant="outline">Total {money(total)}</Badge></div><div className="mt-7 space-y-5">{[["Materia prima", 14280400, 44], ["Sueldos y cargas", 7340000, 23], ["Servicios", 3915200, 12], ["Alquileres", 2860000, 9], ["Logística", 2145600, 7], ["Otros", 1104640, 5]].map(([name, amount, percent]) => <div key={String(name)}><div className="mb-2 flex justify-between text-sm"><span className="font-bold">{name}</span><span>{money(Number(amount))} · {percent}%</span></div><div className="h-2.5 overflow-hidden rounded-full bg-[#f2e8ec]"><div className="h-full rounded-full bg-[#c45c82]" style={{ width: `${percent}%` }} /></div></div>)}</div></div>
          <div className="rounded-3xl border bg-[#3b2931] p-6 text-white shadow-sm"><Store className="size-7 text-[#f2bfd2]"/><h3 className="mt-5 text-xl font-black">Estructura actual</h3><p className="mt-2 text-sm leading-6 text-white/70">Juan B. Justo se conserva sólo en el histórico hasta el 25/09/2026. Al reabrir figurará como cliente/franquicia, no como centro operativo.</p><div className="mt-6 space-y-3 text-sm">{["Fábrica", "Av. de Mayo", "Logística", "Administración"].map(x => <div className="flex items-center gap-2" key={x}><Check className="size-4 text-[#f2bfd2]" />{x}</div>)}</div></div>
        </div>
      </>}

      {tab === "compras" && <div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-xl font-black">Facturas de compra</h3><p className="text-sm text-muted-foreground">Una carga por factura, con todos sus productos, IVA y condición de pago.</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/><Input className="pl-9" placeholder="Buscar factura o proveedor" /></div></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Fecha / comprobante</TableHead><TableHead>Proveedor</TableHead><TableHead>Centro</TableHead><TableHead className="text-right">Neto</TableHead><TableHead className="text-right">IVA</TableHead><TableHead className="text-right">Total factura</TableHead><TableHead>Pago</TableHead></TableRow></TableHeader><TableBody>{purchases.map((row, index) => <TableRow key={`${row.date}-${index}`}><TableCell className="whitespace-nowrap"><b>{row.invoice}</b><div className="text-xs text-muted-foreground">{row.date}</div></TableCell><TableCell><b>{row.supplier}</b><div className="text-xs text-muted-foreground">{row.detail}</div></TableCell><TableCell><Badge variant="outline">{row.center}</Badge></TableCell><TableCell className="text-right">{money(row.net)}</TableCell><TableCell className="text-right">{money(row.tax)}</TableCell><TableCell className="text-right font-black">{money(row.total)}</TableCell><TableCell><Badge className={row.status === "Pagado" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>{row.status}</Badge></TableCell></TableRow>)}</TableBody></Table></div></div>}

      {tab === "gastos" && <div className="space-y-5">
        <div className="flex flex-col gap-4 rounded-3xl border bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-xl font-black">Gastos generales</h3><p className="text-sm text-muted-foreground">Servicios, alquileres, sueldos y otros costos que alimentan el Estado de resultados.</p></div><Button onClick={() => setExpenseOpen(true)} className="rounded-xl bg-[#3b2931] text-white"><Plus /> Nuevo gasto</Button></div>
        {expenseError && <div className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{expenseError}</div>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{expenseCategories.map((category) => { const amount = expenseRows.filter((row) => row.category === category && row.expenseDate.slice(0, 7) === today.slice(0, 7)).reduce((sum, row) => sum + Number(row.amount), 0); return <div key={category} className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-sm font-bold text-muted-foreground">{category}</p><p className="mt-2 text-2xl font-black">{money(amount)}</p><p className="mt-2 text-xs text-muted-foreground">Mes actual</p></div>})}</div>
        <div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b p-5"><h3 className="text-xl font-black">Historial de gastos</h3><p className="text-sm text-muted-foreground">Cada registro impacta automáticamente en el área y mes correspondientes.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Área</TableHead><TableHead>Categoría</TableHead><TableHead>Concepto</TableHead><TableHead>Observaciones</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader><TableBody>{expenseRows.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Todavía no hay gastos registrados.</TableCell></TableRow>}{expenseRows.map((row) => <TableRow key={row.id}><TableCell>{new Date(row.expenseDate).toLocaleDateString("es-AR")}</TableCell><TableCell><Badge variant="outline">{row.area}</Badge></TableCell><TableCell className="font-bold">{row.category}</TableCell><TableCell>{row.concept}</TableCell><TableCell className="text-muted-foreground">{row.notes || "—"}</TableCell><TableCell className="text-right font-black">{money(Number(row.amount))}</TableCell></TableRow>)}</TableBody></Table></div></div>
      </div>}

      {tab === "iva" && <div className="space-y-5"><div className="flex flex-col gap-4 rounded-3xl border bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><Badge className="bg-blue-100 text-blue-700">Octubre 2026</Badge><h3 className="mt-3 text-2xl font-black">IVA crédito fiscal</h3><p className="text-sm text-muted-foreground">IVA pagado en compras computables durante el mes.</p></div><label className="text-sm font-bold">Período<select className="ml-3 h-9 rounded-md border bg-transparent px-3 font-normal"><option>Octubre 2026</option><option>Septiembre 2026</option><option>Agosto 2026</option></select></label></div><div className="grid gap-4 sm:grid-cols-3"><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-sm font-bold text-muted-foreground">IVA 21%</p><p className="mt-2 text-3xl font-black text-blue-700">{money(monthlyVat21)}</p><p className="mt-2 text-xs text-muted-foreground">Facturas y productos gravados al 21%</p></div><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-sm font-bold text-muted-foreground">IVA 10,5%</p><p className="mt-2 text-3xl font-black text-sky-600">{money(monthlyVat105)}</p><p className="mt-2 text-xs text-muted-foreground">Facturas y productos gravados al 10,5%</p></div><div className="rounded-3xl bg-[#3b2931] p-5 text-white shadow-sm"><p className="text-sm font-bold text-white/70">Crédito fiscal total</p><p className="mt-2 text-3xl font-black">{money(monthlyVat21 + monthlyVat105)}</p><p className="mt-2 text-xs text-white/60">Acumulado automático del período</p></div></div><div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b p-5"><h3 className="text-xl font-black">Detalle por comprobante</h3><p className="text-sm text-muted-foreground">Sólo se incluyen facturas de proveedores configurados con IVA.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Comprobante</TableHead><TableHead>Proveedor</TableHead><TableHead>Centro</TableHead><TableHead className="text-right">Neto gravado</TableHead><TableHead className="text-right">IVA 21%</TableHead><TableHead className="text-right">IVA 10,5%</TableHead><TableHead className="text-right">Crédito fiscal</TableHead></TableRow></TableHeader><TableBody>{purchases.filter(row=>row.tax>0).map((row,index)=><TableRow key={index}><TableCell>{row.date}</TableCell><TableCell className="font-bold">{row.invoice}</TableCell><TableCell>{row.supplier}</TableCell><TableCell><Badge variant="outline">{row.center}</Badge></TableCell><TableCell className="text-right">{money(row.net)}</TableCell><TableCell className="text-right">{row.vat21 ? money(row.vat21) : "—"}</TableCell><TableCell className="text-right">{row.vat105 ? money(row.vat105) : "—"}</TableCell><TableCell className="text-right font-black text-blue-700">{money(row.tax)}</TableCell></TableRow>)}</TableBody></Table></div><div className="flex justify-between border-t bg-blue-50 px-5 py-4 font-black"><span>Total crédito fiscal del mes</span><span className="text-blue-700">{money(monthlyVat21 + monthlyVat105)}</span></div></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Importante:</b> los cálculos sirven para control interno. El crédito fiscal definitivo debe validarse con los comprobantes y la liquidación del contador.</div></div>}

      {tab === "pagos" && <div className="space-y-5"><div className="flex flex-col gap-4 rounded-3xl border bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-xl font-black">Pagos a proveedores</h3><p className="text-sm text-muted-foreground">Cada pago descuenta el saldo de la cuenta corriente seleccionada.</p></div><Button onClick={() => setPaymentOpen(true)} className="rounded-xl bg-[#3b2931] text-white"><Plus /> Registrar pago</Button></div><div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Proveedor</TableHead><TableHead>Forma de pago</TableHead><TableHead>Referencia</TableHead><TableHead>Observación</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader><TableBody>{payments.map((row,index)=><TableRow key={`${row.date}-${index}`}><TableCell>{row.date}</TableCell><TableCell className="font-bold">{row.supplier}</TableCell><TableCell><Badge variant="outline">{row.method}</Badge></TableCell><TableCell>{row.reference}</TableCell><TableCell className="text-muted-foreground">{row.note}</TableCell><TableCell className="text-right font-black text-emerald-700">− {money(row.amount)}</TableCell></TableRow>)}</TableBody></Table></div></div>}

      {tab === "proveedores" && <div className="space-y-5"><div className="flex justify-end"><Button className="rounded-xl bg-[#3b2931] text-white"><Plus /> Nuevo proveedor</Button></div><div className="grid gap-5 lg:grid-cols-3">{supplierProfiles.slice(0,3).map(({name, taxMode, debt, invoices, date}) => <div key={name} className="rounded-3xl border bg-white p-6 shadow-sm"><div className="flex items-start justify-between"><div className="grid size-11 place-items-center rounded-2xl bg-[#f8dce7] font-black text-[#a53d67]">{name.slice(0,2).toUpperCase()}</div><div className="flex flex-col items-end gap-2"><Badge variant="outline">{debt ? "Saldo pendiente" : "Sin deuda"}</Badge><Badge className={taxMode === "Con IVA" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"}>{taxMode}</Badge></div></div><h3 className="mt-5 text-xl font-black">{name}</h3><p className="mt-1 text-sm text-muted-foreground">Última compra {date}</p><div className="mt-5 border-t pt-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Saldo actual</p><p className={`mt-1 text-2xl font-black ${debt < 0 ? "text-emerald-700" : debt > 0 ? "text-rose-700" : ""}`}>{money(debt)}</p><p className="mt-1 text-xs text-muted-foreground">{debt > 0 ? "Münna debe al proveedor" : debt < 0 ? "Saldo a favor de Münna" : invoices}</p></div><Button variant="ghost" className="mt-4 w-full justify-between">Ver cuenta corriente <ChevronRight className="size-4"/></Button></div>)}</div><div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-xl font-black">Cuenta corriente · Vacalin</h3><p className="text-sm text-muted-foreground">Facturas suman deuda; pagos y notas de crédito la descuentan.</p></div><div className="text-right"><p className="text-xs font-bold uppercase text-muted-foreground">Saldo actual</p><p className="text-2xl font-black text-rose-700">{money(3258040)}</p></div></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Movimiento</TableHead><TableHead className="text-right">Debe (+)</TableHead><TableHead className="text-right">Haber (−)</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader><TableBody>{vacalinLedger.map((row,index)=><TableRow key={index}><TableCell>{row.date}</TableCell><TableCell className="font-medium">{row.detail}</TableCell><TableCell className="text-right text-rose-700">{row.debit ? money(row.debit) : "—"}</TableCell><TableCell className="text-right text-emerald-700">{row.credit ? money(row.credit) : "—"}</TableCell><TableCell className={`text-right font-black ${row.balance < 0 ? "text-emerald-700" : row.balance > 0 ? "text-rose-700" : ""}`}>{money(row.balance)}</TableCell></TableRow>)}</TableBody></Table></div><div className="border-t bg-[#faf7f8] px-5 py-3 text-xs text-muted-foreground">Saldo positivo: Münna debe al proveedor · Saldo negativo: queda dinero a favor de Münna.</div></div></div>}

      {tab === "materias" && <div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-xl font-black">Perfiles de productos de compra</h3><p className="text-sm text-muted-foreground">Proveedor, presentación, kilos o litros e IVA definidos una sola vez.</p></div><Button className="rounded-xl bg-[#3b2931] text-white"><Plus /> Nuevo producto</Button></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Producto</TableHead><TableHead>Proveedor</TableHead><TableHead>Presentación</TableHead><TableHead>IVA</TableHead><TableHead>Última compra</TableHead><TableHead className="text-right">Último costo</TableHead><TableHead className="text-right">Variación</TableHead></TableRow></TableHeader><TableBody>{rawMaterials.map(row => { const variation = (row.cost / row.previous - 1) * 100; return <TableRow key={row.name}><TableCell><b>{row.name}</b><div className="text-xs text-muted-foreground">Costo por {row.unit}</div></TableCell><TableCell>{row.supplier}</TableCell><TableCell>{row.pack}</TableCell><TableCell><Badge variant="outline">{String(row.vat).replace(".", ",")}%</Badge></TableCell><TableCell>{row.date}</TableCell><TableCell className="text-right font-black">{money(row.cost)}</TableCell><TableCell className="text-right"><Badge className="bg-rose-100 text-rose-700">+{variation.toFixed(1)}%</Badge></TableCell></TableRow>})}</TableBody></Table></div></div>}

      {tab === "formulas" && <div className="space-y-4"><div className="rounded-3xl border bg-white p-6 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-xl font-black">Fórmulas de sabores</h3><p className="text-sm text-muted-foreground">El costo se recalcula con el último precio de cada ingrediente.</p></div><Button className="rounded-xl bg-[#3b2931] text-white"><Plus /> Nueva fórmula</Button></div></div><div className="grid gap-4 lg:grid-cols-2">{flavorCosts.map(row => <div key={row.name} className="rounded-3xl border bg-white p-6 shadow-sm"><div className="flex items-start justify-between"><div><Badge variant="outline">Receta · {row.batch}</Badge><h3 className="mt-3 text-xl font-black">{row.name}</h3><p className="mt-1 text-sm text-muted-foreground">{row.ingredients} ingredientes · actualizado {row.updated}</p></div><FlaskConical className="size-7 text-[#b74e76]"/></div><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-[#fff3f7] p-4"><p className="text-xs font-semibold text-muted-foreground">Costo receta</p><p className="mt-1 text-lg font-black">{money(row.recipe)}</p></div><div className="rounded-2xl bg-[#f5f3f4] p-4"><p className="text-xs font-semibold text-muted-foreground">Costo por kg</p><p className="mt-1 text-lg font-black">{money(row.perKg)}</p></div></div><Button variant="ghost" className="mt-4 w-full justify-between">Abrir fórmula <ChevronRight className="size-4"/></Button></div>)}</div></div>}

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}><DialogContent className="sm:max-w-[650px]"><DialogHeader><DialogTitle>Registrar gasto general</DialogTitle><DialogDescription>Este gasto se incorporará automáticamente al Estado de resultados del área seleccionada.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><label className="space-y-2 text-sm font-bold">Fecha<Input type="date" value={expense.expenseDate} onChange={(e) => setExpense({...expense,expenseDate:e.target.value})}/></label><label className="space-y-2 text-sm font-bold">Área / centro de costo<select value={expense.area} onChange={(e) => setExpense({...expense,area:e.target.value})} className="h-10 w-full rounded-md border bg-white px-3 font-normal">{["Fábrica","Av. de Mayo","Centenario","Administración","Logística"].map(x=><option key={x}>{x}</option>)}</select></label><label className="space-y-2 text-sm font-bold">Categoría<select value={expense.category} onChange={(e)=>setExpense({...expense,category:e.target.value})} className="h-10 w-full rounded-md border bg-white px-3 font-normal">{expenseCategories.map(x=><option key={x}>{x}</option>)}</select></label><label className="space-y-2 text-sm font-bold">Importe<Input value={expense.amount} onChange={(e)=>setExpense({...expense,amount:e.target.value})} inputMode="numeric" placeholder="$ 0"/></label><label className="space-y-2 text-sm font-bold sm:col-span-2">Concepto<Input value={expense.concept} onChange={(e)=>setExpense({...expense,concept:e.target.value})} placeholder="Ej. Factura de luz octubre"/></label><label className="space-y-2 text-sm font-bold sm:col-span-2">Observaciones<Textarea value={expense.notes} onChange={(e)=>setExpense({...expense,notes:e.target.value})} placeholder="Proveedor, período o detalle adicional"/></label></div>{expenseError && <p className="text-sm font-bold text-red-600">{expenseError}</p>}<DialogFooter><Button variant="outline" onClick={()=>setExpenseOpen(false)}>Cancelar</Button><Button disabled={savingExpense} onClick={saveExpense} className="bg-[#3b2931] text-white">{savingExpense ? "Guardando…" : "Guardar gasto"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}><DialogContent className="sm:max-w-[620px]"><DialogHeader><DialogTitle>Registrar pago a proveedor</DialogTitle><DialogDescription>El importe se descuenta de la cuenta corriente del proveedor.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><label className="space-y-2 text-sm font-bold">Proveedor<select value={payment.supplier} onChange={e=>setPayment({...payment,supplier:e.target.value})} className="h-9 w-full rounded-md border bg-transparent px-3 font-normal">{supplierProfiles.map(item=><option key={item.name}>{item.name}</option>)}</select></label><label className="space-y-2 text-sm font-bold">Fecha<Input type="date" defaultValue="2026-10-13"/></label><label className="space-y-2 text-sm font-bold">Monto pagado<Input value={payment.amount} onChange={e=>setPayment({...payment,amount:e.target.value})} inputMode="numeric" placeholder="$ 0"/></label><label className="space-y-2 text-sm font-bold">Forma de pago<select value={payment.method} onChange={e=>setPayment({...payment,method:e.target.value})} className="h-9 w-full rounded-md border bg-transparent px-3 font-normal">{["Transferencia","Efectivo","Echeq","Cheque de tercero","Mercadería"].map(item=><option key={item}>{item}</option>)}</select></label><label className="space-y-2 text-sm font-bold sm:col-span-2">Referencia o comprobante<Input value={payment.reference} onChange={e=>setPayment({...payment,reference:e.target.value})} placeholder="N.º de transferencia, cheque o recibo"/></label><label className="space-y-2 text-sm font-bold sm:col-span-2">Observaciones<Textarea value={payment.note} onChange={e=>setPayment({...payment,note:e.target.value})} placeholder="Ej. Pago parcial, vencimiento del echeq o detalle de la mercadería entregada"/></label></div><div className="rounded-2xl bg-[#f7f3f5] p-4 text-sm"><div className="flex justify-between"><span>Saldo actual del proveedor</span><b>{money(supplierProfiles.find(item=>item.name===payment.supplier)?.debt ?? 0)}</b></div><div className="mt-2 flex justify-between border-t pt-2"><span>Saldo después del pago</span><b>{money((supplierProfiles.find(item=>item.name===payment.supplier)?.debt ?? 0) - (Number(payment.amount.replace(/\D/g,"")) || 0))}</b></div></div><DialogFooter><Button variant="outline" onClick={()=>setPaymentOpen(false)}>Cancelar</Button><Button onClick={savePayment} className="bg-[#3b2931] text-white">Registrar pago</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[820px]"><DialogHeader><DialogTitle>Cargar factura de compra</DialogTitle><DialogDescription>Seleccioná el proveedor y agregá los productos incluidos en el comprobante.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-2 text-sm font-bold lg:col-span-2">Proveedor<select value={purchase.supplier} onChange={e => setPurchase({...purchase, supplier:e.target.value})} className="h-9 w-full rounded-md border bg-transparent px-3 font-normal">{supplierProfiles.map(x=><option key={x.name}>{x.name}</option>)}</select></label>
          <label className="space-y-2 text-sm font-bold">Fecha<Input type="date" defaultValue="2026-10-13"/></label>
          <label className="space-y-2 text-sm font-bold">N.º de factura<Input value={purchase.invoice} onChange={e => setPurchase({...purchase, invoice:e.target.value})} placeholder="FC A 0001-00001"/></label>
          <div className="rounded-2xl border bg-[#fff7fa] p-4 sm:col-span-2 lg:col-span-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase text-muted-foreground">Condición del proveedor</p><p className="font-black">{activeSupplier.name}</p></div><Badge className={activeSupplier.taxMode === "Con IVA" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"}>{activeSupplier.taxMode}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{activeSupplier.taxMode === "Con IVA" ? "El IVA se calcula automáticamente según la alícuota del perfil de cada producto." : "No se agrega IVA: el precio cargado se toma como costo final."}</p></div>
        </div>
        <div className="space-y-3"><div className="flex items-center justify-between"><h4 className="font-black">Productos de la factura</h4><Button variant="outline" size="sm" onClick={() => setInvoiceLines(lines => [...lines, { product: rawMaterials[0].name, quantity: "1", price: "" }])}><Plus /> Agregar producto</Button></div>
          {invoiceLines.map((line, index) => { const profile = rawMaterials.find(item => item.name === line.product) ?? rawMaterials[0]; const subtotal = (Number(line.quantity.replace(",", ".")) || 0) * (Number(line.price.replace(/\D/g, "")) || 0); return <div key={index} className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-[2fr_.65fr_1fr_auto]"><label className="space-y-1 text-xs font-bold">Producto<select value={line.product} onChange={e => setInvoiceLines(lines => lines.map((item, i) => i === index ? {...item, product:e.target.value} : item))} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm font-normal">{rawMaterials.filter(item => item.supplier === purchase.supplier || purchase.supplier === "Proveedor informal").map(item=><option key={item.name}>{item.name}</option>)}</select><span className="block font-normal text-muted-foreground">{profile.pack} · IVA {String(profile.vat).replace(".", ",")}%</span></label><label className="space-y-1 text-xs font-bold">Cantidad<Input value={line.quantity} onChange={e => setInvoiceLines(lines => lines.map((item, i) => i === index ? {...item, quantity:e.target.value} : item))}/></label><label className="space-y-1 text-xs font-bold">Precio por unidad<Input value={line.price} onChange={e => setInvoiceLines(lines => lines.map((item, i) => i === index ? {...item, price:e.target.value} : item))} placeholder="$ 0" inputMode="numeric"/><span className="block text-right font-normal text-muted-foreground">Subtotal {money(subtotal)}</span></label><Button variant="ghost" className="self-center text-muted-foreground" disabled={invoiceLines.length === 1} onClick={() => setInvoiceLines(lines => lines.filter((_, i) => i !== index))}>Quitar</Button></div>})}
        </div>
        <div className="mt-2 grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-bold">Centro de costo<select value={purchase.center} onChange={e => setPurchase({...purchase, center:e.target.value})} className="h-9 w-full rounded-md border bg-transparent px-3 font-normal">{["Fábrica","Av. de Mayo","Logística","Administración"].map(x=><option key={x}>{x}</option>)}</select></label><label className="space-y-2 text-sm font-bold">Condición de pago<select value={purchase.payment} onChange={e => setPurchase({...purchase, payment:e.target.value})} className="h-9 w-full rounded-md border bg-transparent px-3 font-normal"><option>Pagado</option><option>Cuenta corriente</option></select></label></div>
        <div className="ml-auto mt-3 w-full max-w-sm space-y-2 rounded-2xl bg-[#f7f3f5] p-4 text-sm"><div className="flex justify-between"><span>Neto</span><b>{money(invoiceNet)}</b></div><div className="flex justify-between"><span>IVA automático</span><b>{money(invoiceTax)}</b></div><div className="flex justify-between border-t pt-3 text-lg"><span>Total factura</span><b>{money(invoiceNet + invoiceTax)}</b></div>{purchase.payment === "Cuenta corriente" && <p className="text-xs text-amber-700">Se sumará automáticamente al saldo del proveedor.</p>}</div>
        {purchaseError && <p className="text-sm font-bold text-red-600">{purchaseError}</p>}
        <DialogFooter><Button variant="outline" onClick={()=>setPurchaseOpen(false)}>Cancelar</Button><Button disabled={savingPurchase} onClick={savePurchase} className="bg-[#3b2931] text-white">{savingPurchase ? "Guardando…" : "Guardar factura completa"}</Button></DialogFooter>
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
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [currentUser, setCurrentUser] = useState<StaffMember | null>(null);
  const [nextUniqueCode, setNextUniqueCode] = useState("004530");
  const [databaseStatus, setDatabaseStatus] = useState<"connecting" | "live" | "error">("connecting");
  useEffect(() => {
    let active = true;
    fetch("/api/operations")
      .then(async (response) => {
        const data = await response.json() as { stock?: Array<Record<string, unknown>>; productionHistory?: ProductionHistoryRow[]; staff?: StaffMember[]; currentUser?: StaffMember; nextUniqueCode?: string; error?: string };
        if (!response.ok) throw new Error(data.error ?? "No se pudo conectar con la base de datos.");
        if (!active) return;
        setProductionRecords((data.stock ?? []).map((unit) => ({
          uniqueCode: String(unit.uniqueCode), productCode: String(unit.productCode), productName: String(unit.productName),
          container: String(unit.container), weight: unit.weightKg == null ? null : Number(unit.weightKg), units: unit.units == null ? null : Number(unit.units),
          responsible: String(unit.responsible), time: new Date(String(unit.createdAt)).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
          family: String(unit.family), price: Number(unit.basePriceSnapshot), presentation: String(unit.presentation),
        })));
        setNextUniqueCode(data.nextUniqueCode ?? "004530");
        setProductionHistory(data.productionHistory ?? []);
        setStaff(data.staff ?? []);
        setCurrentUser(data.currentUser ?? null);
        setDatabaseStatus("live");
      })
      .catch(() => active && setDatabaseStatus("error"));
    return () => { active = false; };
  }, []);
  const titles: Record<View, string> = {
    inicio: "Panel general",
    produccion: "Producción",
    stock: "Stock de fábrica",
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
          {view === "inicio" && <Dashboard setView={setView} role={currentUser?.role ?? "administracion"} />}{" "}
          {view === "produccion" && (
            <Production
              records={shiftRecords}
              onRegister={async (record) => {
                const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register-production", record }) });
                const result = await response.json() as { error?: string; unit?: { id: number; status?: string; created_at?: string } };
                if (!response.ok) throw new Error(result.error ?? "No se pudo registrar la producción.");
                setShiftRecords((current) => [...current, record]);
                setProductionRecords((current) => [...current, record]);
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
                }, ...current]);
                setNextUniqueCode((current) => String(Number(current) + 1).padStart(6, "0"));
              }}
              onFinalize={() => setShiftRecords([])}
              nextUniqueCode={nextUniqueCode}
              responsibleOptions={staff}
            />
          )}{" "}
          {view === "stock" && <Stock records={productionRecords} />} {view === "historico-produccion" && <ProductionHistory rows={productionHistory} />} {view === "despacho" && (
            <Dispatch
              clients={clients}
              availableUnits={productionRecords}
              onConfirm={async (codes, client) => {
                const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-dispatch", codes, client }) });
                const result = await response.json() as { error?: string };
                if (!response.ok) throw new Error(result.error ?? "No se pudo confirmar el despacho.");
                setProductionRecords((current) => current.filter((record) => !codes.includes(record.uniqueCode)));
              }}
            />
          )}{" "}
          {view === "productos" && <Products />} {view === "clientes" && <Clients clients={clients} setClients={setClients} />}{" "}
          {view === "cta-clientes" && <CustomerAccounts clients={clients} />}{" "}
          {view === "costos" && <Costs />}{" "}
          {view === "resultados" && <ProfitAndLoss />}{" "}
          {view === "nueva-compra" && <Costs initialPurchaseOpen />}{" "}
          {view === "remitos" && <Remittances />}{" "}
          {view === "usuarios" && <StaffManagement staff={staff} setStaff={setStaff} />}{" "}
          {view === "reportes" && <Reports rows={productionHistory} />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
