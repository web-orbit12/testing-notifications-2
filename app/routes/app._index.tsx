import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useNavigation, useSubmit, useLoaderData } from "@remix-run/react";
import db from "../db.server"; // Assuming db is your Prisma client setup
import { Prisma } from '@prisma/client';
import {
  Page,
  Layout,
  Text,
  Badge,
  Card,
  Button,
  BlockStack,
  Box,
  List,
  Link,
  InlineStack,
  InlineGrid,
  TextField,
  useBreakpoints,
  Divider,
  InlineError,
  Icon
} from "@shopify/polaris";
import { MobileCancelMajor } from '@shopify/polaris-icons';
import { authenticate } from "../shopify.server";


export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // Fetch SKUs from the database
  const skus = await db.productSKU.findMany();
  const emails = await db.email.findMany();
  const stockThreshold = await db.stockThreshold.findUnique({
    where: { id: 1 },
  });



  // Return both authentication and SKU data
  return json({ skus, emails, stockThreshold });
};


export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();

  const productSKUs = formData.get('productSKU') || '';
  const emails = formData.get('email') || '';
  const minStockValue = formData.get('minStock');
  const minStock = minStockValue ? Number(minStockValue) : null;

  try {
    // Handle multiple SKUs separated by commas
    if (typeof productSKUs === 'string' && productSKUs.trim()) {
      const skuArray = productSKUs.split(',').map(s => s.trim()).filter(s => s);
      for (const sku of skuArray) {
        try {
          await db.productSKU.create({ data: { sku } });
        } catch (error: unknown) {
          const e = error as Error & { code?: string };
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
            throw e; // Only ignore unique constraint violations, rethrow other errors
          }
          // Log or handle the unique constraint violation if necessary
          console.log(`SKU ${sku} already exists.`);
        }
      }
    }

    const emailErrors = []; // To track invalid emails

    // Handle multiple emails separated by commas
    if (typeof emails === 'string' && emails.trim()) {
      const emailArray = emails.split(',').map(e => e.trim()).filter(e => e);
      for (const email of emailArray) {

        if (!isValidEmail(email)) {
          emailErrors.push(email); // Add invalid email to the errors array
          continue; // Skip further processing for this email
        }

        try {
          await db.email.create({ data: { email } });
        } catch (error: unknown) {
          const e = error as Error & { code?: string };
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
            throw e; // Only ignore unique constraint violations, rethrow other errors
          }
          // Log or handle the unique constraint violation if necessary
          console.log(`Email ${email} already exists.`);
        }
      }
    }

    // Return the errors as part of the response if there are any
    if (emailErrors.length > 0) {
      return json({ emailErrors });
    }

    // Update or create minStock entry only if a valid number is provided
    if (minStock !== null && !isNaN(minStock)) {
      await db.stockThreshold.upsert({
        where: { id: 1 },
        update: { minStock },
        create: { minStock },
      });
    }

    // Retrieve lists of SKUs and Emails to delete
    const skusToDelete = formData.getAll('skusToDelete');
    const emailsToDelete = formData.getAll('emailsToDelete');

    // Delete SKUs
    for (const sku of skusToDelete) {
      if (typeof sku === 'string') {
        await db.productSKU.deleteMany({
          where: { sku },
        });
      }
    }

    // Delete Emails
    for (const email of emailsToDelete) {
      if (typeof email === 'string') {
        await db.email.deleteMany({
          where: { email },
        });
      }
    }


  } catch (error: unknown) {
    // Handle errors here
    const e = error as Error & { code?: string };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      console.log('There is a unique constraint violation, a new entry was not created');
    } else {
      throw e;
    }
  }

  return null; // or redirect to a success page
};





function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}



export default function Index() {
  const nav = useNavigation();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const { smUp } = useBreakpoints();
  
  const { skus, emails, stockThreshold } = useLoaderData(); // Use the data from the loader

  const [productSKUValue, setProductSKUValue] = useState('');
  const [emailValue, setEmailValue] = useState('');
  const [emailErrors, setEmailErrors] = useState<string[]>([]);
  const [minStockValue, setMinStockValue] = useState('');

  const [skusToDelete, setSkusToDelete] = useState<string[]>([]);
  const [emailsToDelete, setEmailsToDelete] = useState<string[]>([]);

  // Add local state to track current session's SKUs and Emails
  const [currentSkus, setCurrentSkus] = useState(skus);
  const [currentEmails, setCurrentEmails] = useState(emails);

  const handleDeleteSku = (skuToDelete: string) => {
    // Remove from the local display immediately
    setCurrentSkus(currentSkus.filter(sku => sku.sku !== skuToDelete));
    // Mark for deletion in the database on save
    setSkusToDelete((prev) => [...prev, skuToDelete]);
  };

  // Similar for emails
  const handleDeleteEmail = (emailToDelete: string) => {
    setCurrentEmails(currentEmails.filter(email => email.email !== emailToDelete));
    setEmailsToDelete((prev) => [...prev, emailToDelete]);
  };

  const handleEmailChange = (value: string) => {
    setEmailValue(value);

    // Split the input by commas and validate each email
    const emails = value.split(',').map(e => e.trim()).filter(e => e);
    const newEmailErrors = emails.filter(email => !isValidEmail(email));

    // Update the emailErrors state
    setEmailErrors(newEmailErrors);
  };


  useEffect(() => {
    // If the action returned errors, set them in state
    if (actionData?.emailErrors) {
      setEmailErrors(actionData.emailErrors);
    }
  }, [actionData]);

  const handleSaveClick = async () => {
    // Only add non-empty and valid SKUs to the newSkus
    const newSkus = productSKUValue
      .split(',')
      .map(sku => ({ id: Date.now().toString(), sku: sku.trim() }))
      .filter(sku => sku.sku);
  
    // Only add non-empty and valid emails to the newEmails
    const newEmails = emailValue
      .split(',')
      .map(email => ({ id: Date.now().toString(), email: email.trim() }))
      .filter(email => email.email && isValidEmail(email.email));
  
    // Update the state as if the SKUs and Emails were already added
    setCurrentSkus(prev => [...prev, ...newSkus]);
    setCurrentEmails(prev => [...prev, ...newEmails]);
  
    // Prepare the form data
    const formData = new FormData();
    formData.append('productSKU', productSKUValue);
    formData.append('email', emailValue);
    formData.append('minStock', minStockValue);
    skusToDelete.forEach(sku => formData.append('skusToDelete', sku));
    emailsToDelete.forEach(email => formData.append('emailsToDelete', email));
  
    try {
      // Submit the data to the server
      const response = await submit(formData, { method: 'post' });
  
      // Check the response to ensure it was successful
      // Handle any discrepancies between optimistic update and actual result here
  
    } catch (error) {
      // If the submission fails, roll back the optimistic updates
      console.error('Failed to save SKUs or Emails:', error);
      // Roll back state changes or notify the user as needed
      setCurrentSkus(skus); // Revert to original skus from loader
      setCurrentEmails(emails); // Revert to original emails from loader
    }
  };
  
  
  
  




  return (
    <Page>
      <ui-title-bar title="Settings">
        <button variant="primary" onClick={handleSaveClick}>
          Sauvegarder
        </button>
      </ui-title-bar>
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: "1fr", md: "2fr 5fr" }} gap="400">
          <Box
            as="section"
            paddingInlineStart={{ xs: '400', sm: '0' }}
            paddingInlineEnd={{ xs: '400', sm: '0' }}
          >
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd"> SKU Produit</Text>
              <Text as="p" variant="bodyMd"> Entrez les SKU des produits concernés par les alertes, séparés par des virgules.</Text>
            </BlockStack>
          </Box>
          <Card roundedAbove="sm">
            <BlockStack gap="400">
              <TextField
                label="Product SKU"
                name="productSKU"
                value={productSKUValue}
                onChange={(value) => setProductSKUValue(value)}
                autoComplete="off"
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                {currentSkus.map((sku: { id: string; sku: string }) => (
                  <div key={sku.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Badge tone="success">{sku.sku}</Badge>
                    <button
                      onClick={() => handleDeleteSku(sku.sku)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginLeft: '-10px' }}
                      aria-label={`Delete ${sku.sku}`}
                    >
                      <Icon source={MobileCancelMajor} />
                    </button>
                  </div>
                ))}
              </div>

            </BlockStack>
          </Card>

        </InlineGrid>

        <InlineGrid columns={{ xs: "1fr", md: "2fr 5fr" }} gap="400">
          <Box
            as="section"
            paddingInlineStart={{ xs: '400', sm: '0' }}
            paddingInlineEnd={{ xs: '400', sm: '0' }}
          >
            <BlockStack gap="400">

              <Text as="h3" variant="headingMd"> Champ Email</Text>
              <Text as="p" variant="bodyMd"> Saisissez les adresses e-mail pour recevoir les notifications, séparées par des virgules.</Text>

            </BlockStack>
          </Box>
          <Card roundedAbove="sm">
            <BlockStack gap="400">


              <TextField
                label="Email"
                name="email"
                value={emailValue}
                onChange={handleEmailChange}
                autoComplete="off"
                error={emailErrors.length > 0}
              />

              {/* Displaying inline errors for email */}
              {emailErrors.map((error, index) => (
                <InlineError key={index} message={`Invalid email format: ${error}`} fieldID="emailField" />
              ))}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                {currentEmails.map((email) => (
                  <div key={email.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Badge tone="success">{email.email}</Badge>
                    <button
                      onClick={() => handleDeleteEmail(email.email)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginLeft: '-10px' }}
                      aria-label={`Delete ${email.email}`}
                    >
                      <Icon source={MobileCancelMajor} />
                    </button>
                  </div>
                ))}
              </div>

            </BlockStack>
          </Card>
        </InlineGrid>

        <InlineGrid columns={{ xs: "1fr", md: "2fr 5fr" }} gap="400">
          <Box
            as="section"
            paddingInlineStart={{ xs: '400', sm: '0' }}
            paddingInlineEnd={{ xs: '400', sm: '0' }}
          >
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd"> Champ Seuil de Stock</Text>
              <Text as="p" variant="bodyMd"> Indiquez le seuil de stock minimum. Si le stock d'un produit descend en dessous de ce nombre, une notification sera envoyée. Exemple : 20. Le seuil s'applique à tous les produits listés.</Text>
            </BlockStack>
          </Box>
          <Card roundedAbove="sm">
            <BlockStack gap="400">

              <TextField
                label="Seuil de stock"
                name="minStock"
                value={minStockValue}
                onChange={(value) => setMinStockValue(value)}
                autoComplete="off"
              />
              {/* Display the current stock threshold value */}

              {stockThreshold && (
                <div style={{ marginTop: '0.5rem' }}>
                  <Badge tone="info">{stockThreshold.minStock}</Badge>
                </div>
              )}

            </BlockStack>
          </Card>
        </InlineGrid>

      </BlockStack>
    </Page>
  );
}
