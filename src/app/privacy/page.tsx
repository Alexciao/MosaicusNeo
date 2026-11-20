// L'informativa sulla privacy sta dentro l'app (components/app/privacy-dialog.tsx): questo indirizzo,
// usato nei vecchi link e nelle email, la apre lì.

import { redirect } from "next/navigation";

export default function PrivacyPage() {
  redirect("/?privacy");
}
