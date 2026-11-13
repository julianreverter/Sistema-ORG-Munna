import { Orders } from "@/components/orders";

export default function CustomerOrdersPage() {
  return <main className="min-h-screen bg-[#fbf7f8] px-4 py-8 sm:px-8">
    <div className="mx-auto max-w-6xl"><Orders portal /></div>
  </main>;
}
