import { Installer } from "@/types/installer";

export const mockInstallers: Installer[] = [
  {
    id: "1",
    name: "Shade Solutions Inc.",
    address: "123 Main St, Anytown, CA",
    zipCode: "90210",
    phone: "555-111-2222",
    skills: ["Blinds & Shades", "Drapery"],
    certifications: ["Certified Installer"],
    latitude: 34.0736, // Example latitude for Anytown, CA (Beverly Hills)
    longitude: -118.4004, // Example longitude for Anytown, CA (Beverly Hills)
  },
  {
    id: "2",
    name: "Window Wizards LLC",
    address: "456 Oak Ave, Somewhere, NY",
    zipCode: "10001",
    phone: "555-333-4444",
    skills: ["Blinds & Shades", "Shutters", "PowerView"],
    certifications: ["PowerView Pro", "Master Installer"],
    latitude: 40.7128, // Example latitude for Somewhere, NY (NYC)
    longitude: -74.0060, // Example longitude for Somewhere, NY (NYC)
  },
  {
    id: "3",
    name: "Custom Coverings Co.",
    address: "789 Pine Ln, Otherville, TX",
    zipCode: "75001",
    phone: "555-555-6666",
    skills: ["Drapery", "Shutters"],
    certifications: ["Master Shutter"],
    latitude: 33.0198, // Example latitude for Otherville, TX (Plano)
    longitude: -96.6989, // Example longitude for Otherville, TX (Plano)
  },
  {
    id: "4",
    name: "Elite Blinds & More",
    address: "101 Elm St, Anytown, CA",
    zipCode: "90210",
    phone: "555-777-8888",
    skills: ["Blinds & Shades", "PowerView"],
    certifications: ["PowerView Pro", "Certified Installer"],
    latitude: 34.0750, // Example latitude for Anytown, CA (Beverly Hills)
    longitude: -118.4020, // Example longitude for Anytown, CA (Beverly Hills)
  },
  {
    id: "5",
    name: "Precision Shades",
    address: "202 Maple Rd, Somewhere, NY",
    zipCode: "10001",
    phone: "555-999-0000",
    skills: ["Blinds & Shades", "Drapery", "Shutters"],
    certifications: ["Master Installer"],
    latitude: 40.7150, // Example latitude for Somewhere, NY (NYC)
    longitude: -74.0080, // Example longitude for Somewhere, NY (NYC)
  },
];