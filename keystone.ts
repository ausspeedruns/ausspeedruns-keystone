import 'dotenv/config';
import { config, graphql } from '@keystone-6/core';
import { statelessSessions } from '@keystone-6/core/session';
import { createAuth } from '@keystone-6/auth';
import { v4 as uuid } from 'uuid';

import { Role, User } from './schema/user';
import { Submission } from './schema/submission';
import { Event } from './schema/event';
import { Post } from './schema/post';
import { permissions, rules } from './schema/access';
import { Run } from './schema/runs';
import { Verification } from './schema/verification';
import { Ticket } from './schema/tickets';

import { sendResetPassword } from './email/emails';
import { Context } from '.keystone/types';
import { Volunteer } from './schema/volunteers';
import { ShirtOrder } from './schema/orders';
import { Incentive } from './schema/incentives';
import { gql } from '@keystone-6/core/admin-ui/apollo';

const session = statelessSessions({
  secret: process.env.SESSION_SECRET,
  maxAge: 60 * 60 * 24 * 30 // 30 Days
});

const { withAuth } = createAuth({
  listKey: 'User',
  identityField: 'email',
  secretField: 'password',
  sessionData: 'username id roles { admin canManageUsers canManageContent runner volunteer event { shortname } }',
  passwordResetLink: {
    sendToken: async ({ itemId, identity, token, context }) => {
      sendResetPassword(identity, token);
    }
  },
  initFirstItem: {
    // These fields are collected in the "Create First User" form
    fields: ['name', 'email', 'password', 'username', 'dateOfBirth'],
    itemData: {
      roles: {
        create: {
          name: 'Admin',
          admin: true,
          canManageContent: true,
          canManageUsers: true,
          runner: true,
          volunteer: true,
        },
      },
    },
    skipKeystoneWelcome: true,
  },
});

export default withAuth(
  config({
    db: { provider: 'postgresql', url: process.env.DATABASE_URL, useMigrations: true },
    experimental: {
      generateNextGraphqlAPI: true,
    },
    lists: { Post, User, Submission, Event, Role, Run, Verification, Ticket, Volunteer, ShirtOrder, Incentive },
    extendGraphqlSchema: graphql.extend(base => {
      return {
        query: {
          accountVerification: graphql.field({
            type: base.object('Verification'),
            args: {
              where: graphql.arg({ type: graphql.nonNull(base.inputObject('VerificationWhereUniqueInput')) }),
            },
            async resolve(source, args, context: Context) {
              // Super duper hacky way but oh well
              try {
                if (!args?.where?.code) {
                  throw new Error("Missing code query");
                }

                const itemArr = await context.sudo().db.Verification.findMany({ where: { code: { equals: args.where.code } } });

                if (itemArr.length === 1) {
                  return itemArr[0];
                }

                throw new Error("Couldn't find code or found too many.");
              } catch (error) {
                throw new Error(error);
              }
            }
          })
        },
        mutation: {
          confirmStripe: graphql.field({
            type: base.object('Ticket'),
            args: {
              stripeID: graphql.arg({ type: graphql.nonNull(graphql.String) }),
              numberOfTickets: graphql.arg({ type: graphql.nonNull(graphql.Int) }),
              apiKey: graphql.arg({ type: graphql.nonNull(graphql.String) }),
            },
            resolve(source, { apiKey, numberOfTickets, stripeID }, context: Context) {
              if (apiKey !== process.env.API_KEY) throw new Error("Incorrect API Key");
              // if (apiKey !== process.env.API_KEY) {
              //   // Debug only
              //   console.log(`Tried to confirm stripe but had an API key error. Got ${apiKey}, expected ${process.env.API_KEY}`);
              //   return;
              // }

              return context.sudo().db.Ticket.updateOne({
                where: { stripeID },
                data: { paid: true, numberOfTickets }
              });
            }
          }),
          generateTicket: graphql.field({
            type: base.object('Ticket'),
            args: {
              userID: graphql.arg({ type: graphql.nonNull(graphql.ID) }),
              numberOfTickets: graphql.arg({ type: graphql.nonNull(graphql.Int) }),
              method: graphql.arg({ type: graphql.nonNull(base.enum('TicketMethodType')) }),
              event: graphql.arg({ type: graphql.nonNull(graphql.String) }),
              stripeID: graphql.arg({ type: graphql.String }),
              apiKey: graphql.arg({ type: graphql.nonNull(graphql.String) }),
            },
            async resolve(source, { apiKey, event, method, numberOfTickets, stripeID, userID }, context: Context) {
              if (apiKey !== process.env.API_KEY) throw new Error("Incorrect API Key");

              // Check user is verified
              const userVerified = await context.sudo().query.User.findOne({ where: { id: userID }, query: 'verified' });

              if (!userVerified.verified) {
                // console.log(`Unverified user ${userID} tried to generate ticket.`)
                throw new Error('Unverified user.');
              }

              return context.sudo().db.Ticket.createOne({
                data: {
                  user: { connect: { id: userID } },
                  numberOfTickets,
                  method,
                  event: { connect: { shortname: event } },
                  stripeID: stripeID ?? uuid(),
                }
              });
            }
          }),
          confirmShirtStripe: graphql.field({
            type: base.object('ShirtOrder'),
            args: {
              stripeID: graphql.arg({ type: graphql.nonNull(graphql.String) }),
              apiKey: graphql.arg({ type: graphql.nonNull(graphql.String) }),
            },
            resolve(source, { apiKey, stripeID }, context: Context) {
              if (apiKey !== process.env.API_KEY) throw new Error("Incorrect API Key");

              return context.sudo().db.ShirtOrder.updateOne({
                where: { stripeID },
                data: { paid: true }
              });
            }
          }),
          generateShirt: graphql.field({
            type: base.object('ShirtOrder'),
            args: {
              userID: graphql.arg({ type: graphql.nonNull(graphql.ID) }),
              size: graphql.arg({ type: graphql.nonNull(base.enum('ShirtOrderSizeType')) }),
              method: graphql.arg({ type: graphql.nonNull(base.enum('TicketMethodType')) }),
              colour: graphql.arg({ type: graphql.nonNull(base.enum('ShirtOrderColourType')) }),
              stripeID: graphql.arg({ type: graphql.String }),
              apiKey: graphql.arg({ type: graphql.nonNull(graphql.String) }),
            },
            async resolve(source, { apiKey, colour, method, size, stripeID, userID }, context: Context) {
              if (apiKey !== process.env.API_KEY) throw new Error("Incorrect API Key");

              // Check user is verified
              const userVerified = await context.sudo().query.User.findOne({ where: { id: userID }, query: 'verified' });

              if (!userVerified.verified) {
                // console.log(`Unverified user ${userID} tried to generate ticket.`)
                throw new Error('Unverified user.');
              }

              return context.sudo().db.ShirtOrder.createOne({
                data: {
                  user: { connect: { id: userID } },
                  size,
                  colour,
                  method,
                  stripeID: stripeID ?? uuid(),
                }
              });
            }
          }),
        }
      }
    }),
    session,
    ui: {
      isAccessAllowed: permissions.canManageContent
    },
    server: {
      port: 8000,
    }
  })
);
