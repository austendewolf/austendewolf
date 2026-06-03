import { register as praetomRegister } from "praetom";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await praetomRegister({ ingestToken: "praetom_pub_qd-RXZArvEdG4ymqTzsVIli8bfTB7Btn" });
}
