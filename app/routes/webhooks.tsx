import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(
    request
    );

  if (!admin) {
    // If the admin context isn't available, it might mean the shop was uninstalled
    return new Response("Shop not found or uninstalled", { status: 404 });
  }

// Define a type for inventory item
type InventoryItem = {
  id: string;
  available: number;
  // Add other relevant fields here
};

  try {
    switch (topic) {
      case "APP_UNINSTALLED":
        if (session) {
          await db.session.deleteMany({ where: { shop } });
          console.log("SESSION DELETED");
        }
        break;
      case "PRODUCTS_CREATE":
          console.log("ITEM CREATED");
          break;
      case "PRODUCTS_DELETE":
        console.log("ITEM DELETED");
        break;
      case "CUSTOMERS_DATA_REQUEST":
      case "CUSTOMERS_REDACT":
      case "SHOP_REDACT":
        // Handle other webhook topics as needed
        break;
      default:
        return new Response("Unhandled webhook topic", { status: 404 });
    }

    // Return a success response for successfully processed webhook
    return json({ success: true });

  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
