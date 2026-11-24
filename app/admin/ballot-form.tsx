"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { sendManagement } from "./manage-client";

export function BallotForm({ electionId, action, target, children, label, plain = false, confirmText }: {
  electionId: string; action: string; target?: { name: string; id: string };
  children?: ReactNode; label: string; plain?: boolean; confirmText?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || (confirmText && !window.confirm(confirmText))) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setMessage(undefined);
    try {
      const result = await sendManagement(data);
      if (result.error) {
        setMessage({ text: result.error, error: true });
        return;
      }
      if (action.endsWith("-add")) form.reset();
      setMessage({ text: result.message ?? "Perubahan disimpan.", error: false });
      router.refresh();
    } catch {
      setMessage({ text: "Sambungan gagal. Semak halaman sebelum mencuba lagi.", error: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <input type="hidden" name="electionId" value={electionId} />
      <input type="hidden" name="action" value={action} />
      {target && <input type="hidden" name={target.name} value={target.id} />}
      <fieldset disabled={pending} className={plain ? "grid gap-1" : "manage-form"}>
        {children}
        <button type="submit" className={plain ? "ghost" : "btn"}>{pending ? "Memproses…" : label}</button>
      </fieldset>
      {message && <p role={message.error ? "alert" : "status"} className={message.error ? "form-error" : "mut"}>{message.text}</p>}
    </form>
  );
}

export function PhotoInput() {
  const [preview, setPreview] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => setPreview(undefined);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, []);
  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div className="grid min-w-0 gap-1">
      <label className="grid gap-1">
        Foto calon
        <input ref={input} name="photo" type="file" accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setPreview(file && file.type.startsWith("image/") && file.size <= 5 * 1024 * 1024
              ? URL.createObjectURL(file) : undefined);
          }} />
      </label>
      {preview && (
        <figure className="flex items-center gap-2">
          <Image src={preview} alt="Pratonton potongan foto calon" width={80} height={80} unoptimized
            className="h-20 w-20 rounded-lg object-cover" />
          <figcaption className="mut">Pratonton potongan segi empat sama</figcaption>
        </figure>
      )}
      <small className="mut">JPEG, PNG atau WebP, maksimum 5 MB.</small>
    </div>
  );
}
