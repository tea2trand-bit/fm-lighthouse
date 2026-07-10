import { 
  fm360Employees, 
  fm360Shifts, 
  fm360Piket, 
  fm360Brandschutz, 
  fm360Security 
} from "./db/schema.ts";

console.log("Checking schema imports and table structures...");

// Test Employees Table definition
if (fm360Employees && typeof fm360Employees === "object") {
  console.log("✓ fm360Employees table is defined.");
} else {
  throw new Error("fm360Employees table is not defined or is not an object!");
}

// Test Shifts Table definition
if (fm360Shifts && typeof fm360Shifts === "object") {
  console.log("✓ fm360Shifts table is defined.");
} else {
  throw new Error("fm360Shifts table is not defined or is not an object!");
}

// Test Piket Table definition
if (fm360Piket && typeof fm360Piket === "object") {
  console.log("✓ fm360Piket table is defined.");
} else {
  throw new Error("fm360Piket table is not defined or is not an object!");
}

// Test Brandschutz Table definition
if (fm360Brandschutz && typeof fm360Brandschutz === "object") {
  console.log("✓ fm360Brandschutz table is defined.");
} else {
  throw new Error("fm360Brandschutz table is not defined or is not an object!");
}

// Test Security Table definition
if (fm360Security && typeof fm360Security === "object") {
  console.log("✓ fm360Security table is defined.");
} else {
  throw new Error("fm360Security table is not defined or is not an object!");
}

console.log("All schema tables successfully verified!");
