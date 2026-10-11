import stripeSDK from "./stripeSDK";

export default async function updateCustomerEmail(
  email: string,
  newEmail: string
) {
  const stripe = stripeSDK();
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedNewEmail = newEmail.toLowerCase().trim();
  let updated = false;

  const customers = stripe.customers.list({
    email: normalizedEmail,
    limit: 100,
  });

  for await (const customer of customers) {
    if (customer.email?.toLowerCase().trim() !== normalizedEmail) continue;

    await stripe.customers.update(customer.id, {
      email: normalizedNewEmail,
    });
    updated = true;
  }

  return updated;
}
