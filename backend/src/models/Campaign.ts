import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from "sequelize";
import { sequelize } from "../db.js";
import { User } from "./User.js";

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent";

export class Campaign extends Model<InferAttributes<Campaign>, InferCreationAttributes<Campaign>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare subject: string;
  declare body: string;
  declare status: CreationOptional<CampaignStatus>;
  declare scheduled_at: CreationOptional<Date | null>;
  declare created_by: ForeignKey<User["id"]>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

Campaign.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    subject: { type: DataTypes.STRING(500), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: "draft",
      allowNull: false,
      validate: { isIn: [["draft", "scheduled", "sending", "sent"]] },
    },
    scheduled_at: { type: DataTypes.DATE, allowNull: true },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: false },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: false },
  },
  {
    sequelize,
    tableName: "campaigns",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

User.hasMany(Campaign, { foreignKey: "created_by", as: "campaigns" });
Campaign.belongsTo(User, { foreignKey: "created_by", as: "creator" });
