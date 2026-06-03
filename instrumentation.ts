import { register as praetomRegister } from "praetom";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await praetomRegister({ ingestToken: "praetom_pub_A1fi0asq5YZVoZjP784hqSCViChwRrek" });
}
