import webhook from "../webhooks/stripe";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default webhook;
