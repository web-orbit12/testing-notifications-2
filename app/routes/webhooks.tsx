import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { JSONValue } from "node_modules/@shopify/shopify-app-remix/build/ts/server/types";
import nodemailer from 'nodemailer';

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

function safeParseJSON(jsonString: JSONValue | object) {
  if (typeof jsonString === 'string') {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error("Error parsing JSON:", error);
      return null;
    }
  } else {
    // If it's not a string, just return it as is
    return jsonString;
  }
}



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
      case "INVENTORY_LEVELS_UPDATE":
        console.log("STOCK UPDATE TRIGGERED");

        // Try to safely parse the payload
        const inventoryData = safeParseJSON(payload);
        console.log("Parsed Payload:", inventoryData);

        if (inventoryData && typeof inventoryData === 'object') {
          const stockThresholdEntry = await db.stockThreshold.findUnique({
            where: { id: 1 } // Assuming the threshold is stored with id 1
          });
      
          if (!stockThresholdEntry) {
            console.error("Stock threshold entry not found in database");
            break;
          }
      
          const stockThreshold = stockThresholdEntry.minStock;
          const { available, inventory_item_id } = inventoryData;

          // Check if the inventory level is below the threshold
          if (available < stockThreshold) {
            console.log(`Inventory for item ${inventory_item_id} is below threshold: ${available}`);
            // Add more logic here if needed, e.g., sending alerts
          }
        } else {
          console.error("Invalid or unexpected inventory data format");
        }
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
