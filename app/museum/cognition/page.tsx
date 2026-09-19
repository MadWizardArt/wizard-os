import { redirect } from "next/navigation";

// Legacy route remains valid; shared evidence now lives within Intelligence.
export default function SharedCognitionRedirect() {
  redirect("/museum/intelligence?source=cognition#shared-cognition");
}
