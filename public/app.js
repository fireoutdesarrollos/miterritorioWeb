import { iniciarControladorUI } from "./ui-controller.js";
import { iniciarAutenticacion } from "./auth-service.js";
import { inicializarGuias } from "./guide-service.js";

console.log("🚀 MOTOR JS MODULAR (VERSIÓN 200 - ARQUITECTURA LIMPIA) CARGADO");
iniciarControladorUI();
iniciarAutenticacion();
inicializarGuias();