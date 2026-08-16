'use client'

import { FormEvent, useState } from 'react'
import { QrCode } from 'lucide-react'

export default function AdminLoginPage() {
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('Owner authentication is not configured yet. Connect the auth provider before signing in.')
  }
  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm"><div className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-xl bg-terracotta text-primary-foreground"><QrCode /></span><div><p className="font-display text-xl font-bold">QRServe</p><p className="text-xs text-muted-foreground">Owner workspace</p></div></div><h1 className="mt-10 font-display text-3xl font-bold">Welcome back.</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in to manage your live restaurant operations.</p><form onSubmit={submit} className="mt-8 flex flex-col gap-5"><label className="flex flex-col gap-2 text-sm font-semibold">Email<input name="email" type="email" required className="rounded-xl border border-input bg-background px-3 py-3 font-normal outline-none focus:ring-2 focus:ring-ring" placeholder="owner@restaurant.com" /></label><label className="flex flex-col gap-2 text-sm font-semibold">Password<input name="password" type="password" required className="rounded-xl border border-input bg-background px-3 py-3 font-normal outline-none focus:ring-2 focus:ring-ring" placeholder="••••••••" /></label>{error && <p className="rounded-xl bg-destructive/10 px-3 py-3 text-sm text-destructive">{error}</p>}<button className="rounded-xl bg-ink px-4 py-3 text-sm font-bold text-primary-foreground">Sign in</button></form></div></main>
}
