import { list } from '@keystone-6/core';
import { Lists } from '.keystone/types';
import { integer, json, relationship, select, text } from '@keystone-6/core/fields';
import { SessionContext } from './access';
import { availability } from './fields/availability';
import { allowAll } from '@keystone-6/core/access';

export const Volunteer: Lists.Volunteer = list({
	access: {
		filter: {
			query: ({ session }: SessionContext) => {
				if (!session?.data) return false;
				if (session.data.roles?.some(role => role.canManageContent)) return true;
				return { volunteer: { username: { equals: session.data.username } } }
			},
			update: ({ session }: SessionContext) => {
				if (!session?.data) return false;
				if (session.data.roles?.some(role => role.canManageContent)) return true;
				return { volunteer: { username: { equals: session.data.username } }, status: { equals: "submitted" } }
			},
			delete: ({ session }: SessionContext) => {
				if (!session?.data) return false;
				if (session.data.roles?.some(role => role.canManageContent)) return true;
				return { volunteer: { username: { equals: session.data.username } }, status: { equals: "submitted" } }
			},
		},
		operation: allowAll
	},
	fields: {
		volunteer: relationship({ ref: 'User.volunteer', ui: { hideCreate: true, labelField: 'username' } }),
		jobType: select({
			type: 'enum',
			options: [
				{ label: "Host", value: "host" },
				{ label: "Social Media", value: "social" },
				{ label: "Runner Management", value: "runMgmt" },
				{ label: "Tech", value: "tech" },
			]
		}),
		eventHostTime: integer({ defaultValue: 0 }),
		maxDailyHostTime: integer({ defaultValue: 0 }),
		dayTimes: json({ defaultValue: [] }),
		specificGame: text(),
		specificRunner: text(),
		additionalInfo: text(),
		experience: text(),
		favMeme: text(),
		runnerManagementAvailability: text(),
		techAvailablity: text(),
		techExperience: text(),
		event: relationship({ ref: 'Event.volunteer', ui: { hideCreate: true } }),
	}
});