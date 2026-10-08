"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { AddressRequest, Registry, ShippingAddress } from "@/lib/types";

const EMPTY_ADDRESS: ShippingAddress = {
  recipient: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "United States",
};

const POLL_MS = 30000;

type Private = { address: ShippingAddress | null; requests: AddressRequest[] };

/**
 * Names, a note for family, the private shipping address, and who has asked for it.
 * Closed, it shows only address requests, since those need an answer.
 */
export function RegistryDetails({ registry, onSaved, open = true }: { registry: Registry; onSaved: () => Promise<void>; open?: boolean }) {
  const [data, setData] = useState<Private | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<Private>(`/api/registries/${registry.id}/details`));
    } catch {
      // The rest of the page still works; the next poll retries.
    }
  }, [registry.id]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const people = [registry.parentNames, registry.babyName && `baby ${registry.babyName}`].filter(Boolean).join(", ");

  return (
    <section className="space-y-4" aria-label="Registry details">
      {!open ? null : editing ? (
        <DetailsForm
          registry={registry}
          address={data?.address ?? null}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await Promise.all([onSaved(), load()]);
          }}
        />
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1 text-[14px]">
            <p className={people ? "" : "text-muted"}>{people ? `For ${people}` : "No names added yet"}</p>
            <p className="text-muted">
              {data?.address ? `Shipping to ${data.address.city || data.address.line1}, shared only when you approve` : "No shipping address yet"}
            </p>
          </div>
          <button className="btn-quiet shrink-0 px-4 py-2.5" onClick={() => setEditing(true)}>
            Edit details
          </button>
        </div>
      )}
      {data && <AddressRequests registryId={registry.id} requests={data.requests} hasAddress={Boolean(data.address)} onChange={load} />}
    </section>
  );
}

function DetailsForm({
  registry,
  address,
  onCancel,
  onSaved,
}: {
  registry: Registry;
  address: ShippingAddress | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [details, setDetails] = useState({
    title: registry.title,
    parentNames: registry.parentNames,
    babyName: registry.babyName,
    familyNote: registry.familyNote,
  });
  const [addr, setAddr] = useState<ShippingAddress>(address ?? EMPTY_ADDRESS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const addressStarted = [addr.recipient, addr.line1, addr.line2, addr.city, addr.region, addr.postalCode].some((v) => v.trim());

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/registries/${registry.id}/details`, {
        method: "PUT",
        body: JSON.stringify({ details, address: addressStarted ? addr : null }),
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const field = (label: string, value: string, onChange: (v: string) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block space-y-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="field" {...props} />
    </label>
  );
  const setA = (key: keyof ShippingAddress) => (v: string) => setAddr((a) => ({ ...a, [key]: v }));

  return (
    <form
      className="space-y-5 rounded-xl bg-surface p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="space-y-3">
        {field("Registry title", details.title, (title) => setDetails((d) => ({ ...d, title })), { required: true, maxLength: 80 })}
        {field("Your names", details.parentNames, (parentNames) => setDetails((d) => ({ ...d, parentNames })), {
          placeholder: "Maya and Jordan",
          maxLength: 80,
          autoComplete: "name",
        })}
        {field("Baby's name (optional)", details.babyName, (babyName) => setDetails((d) => ({ ...d, babyName })), {
          placeholder: "Not decided yet is fine",
          maxLength: 40,
        })}
        <label className="block space-y-1.5">
          <span className="text-[13px] text-muted">A note for family (shown on your share page)</span>
          <textarea
            value={details.familyNote}
            onChange={(e) => setDetails((d) => ({ ...d, familyNote: e.target.value }))}
            maxLength={500}
            rows={3}
            placeholder="Thank you for thinking of us. Gently used is welcome!"
            className="field resize-none"
          />
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="font-semibold">Shipping address</legend>
        <p className="text-[13px] text-muted">
          Private. Family can ask for it from your share page, and you choose who gets it.
        </p>
        {field("Name on the package", addr.recipient, setA("recipient"), { autoComplete: "shipping name" })}
        {field("Street address", addr.line1, setA("line1"), { autoComplete: "shipping address-line1" })}
        {field("Apartment, unit (optional)", addr.line2, setA("line2"), { autoComplete: "shipping address-line2" })}
        <div className="grid grid-cols-2 gap-3">
          {field("City", addr.city, setA("city"), { autoComplete: "shipping address-level2" })}
          {field("State", addr.region, setA("region"), { autoComplete: "shipping address-level1" })}
          {field("ZIP code", addr.postalCode, setA("postalCode"), { autoComplete: "shipping postal-code", inputMode: "numeric" })}
          {field("Country", addr.country, setA("country"), { autoComplete: "shipping country-name" })}
        </div>
        {address && (
          <button type="button" className="link text-[13px]" onClick={() => setAddr({ ...EMPTY_ADDRESS, country: "" })}>
            Remove address
          </button>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn-quiet flex-1 py-2.5" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="btn-primary flex-1 py-2.5" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function AddressRequests({
  registryId,
  requests,
  hasAddress,
  onChange,
}: {
  registryId: string;
  requests: AddressRequest[];
  hasAddress: boolean;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pending = requests.filter((r) => r.status === "pending");
  const approved = requests.filter((r) => r.status === "approved");

  async function decide(requestId: string, decision: "approved" | "declined") {
    setBusy(requestId);
    setError("");
    try {
      await api(`/api/registries/${registryId}/details`, { method: "POST", body: JSON.stringify({ requestId, decision }) });
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!pending.length && !approved.length) return null;

  return (
    <div className="space-y-3">
      {pending.length > 0 && (
        <div className="space-y-3 rounded-xl bg-surface p-4">
          <p className="font-semibold">
            {pending.length === 1 ? "1 person is" : `${pending.length} people are`} asking for your address
          </p>
          {!hasAddress && <p className="text-[13px] text-muted">Add an address in your details before sharing it.</p>}
          <ul className="space-y-4">
            {pending.map((r) => (
              <li key={r.id} className="space-y-2">
                <div className="text-[14px]">
                  <p>
                    <span className="font-semibold">{r.name}</span> <span className="text-muted">({r.contact})</span>
                  </p>
                  {r.message && <p className="font-serif text-note italic">&ldquo;{r.message}&rdquo;</p>}
                </div>
                <div className="flex gap-2">
                  <button className="btn-quiet flex-1 py-2" onClick={() => void decide(r.id, "declined")} disabled={busy === r.id}>
                    Decline
                  </button>
                  <button
                    className="btn-primary flex-1 py-2"
                    onClick={() => void decide(r.id, "approved")}
                    disabled={busy === r.id || !hasAddress}
                  >
                    Share address
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {approved.length > 0 && (
        <details className="text-[13px] text-muted">
          <summary className="cursor-pointer">Address shared with {approved.length === 1 ? approved[0].name : `${approved.length} people`}</summary>
          <ul className="mt-2 space-y-1">
            {approved.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3">
                <span className="truncate">
                  {r.name} ({r.contact})
                </span>
                <button className="link shrink-0" onClick={() => void decide(r.id, "declined")} disabled={busy === r.id}>
                  Stop sharing
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
