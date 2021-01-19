import type { AppProps } from "next/app";
import {
  ApolloClient,
  HttpLink,
  InMemoryCache,
  ApolloProvider,
} from "@apollo/client";
import { Theme } from "@mindfulstudio/project-eden-ui";
import "reset-css";

const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: new HttpLink({
    uri: process.env.GRAPHQL_URL,
    fetch,
  }),
  defaultOptions: {
    watchQuery: {
      pollInterval: parseInt(process.env.POLL_INTERVAL as string, 10),
    },
  },
});

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ApolloProvider client={client}>
      <Theme>
        <Component {...pageProps} />
      </Theme>
    </ApolloProvider>
  );
}

export default MyApp;
