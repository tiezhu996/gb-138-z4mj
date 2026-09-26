# 临终关怀信息指南

提供临终关怀知识、症状照护、家属指导和资源清单的指南应用。

## 快速启动（Docker Compose）

```bash
cp .env.example .env
docker compose up -d --build
```

启动后访问：

- 前端：http://localhost:8238
- 后端健康检查：http://localhost:3238/api/health
- 数据库端口：localhost:5738

停止并清理容器、网络和数据卷：

```bash
docker compose down -v --remove-orphans
```

## 主要功能

- 临终关怀知识导航
- 症状照护与心理支持信息
- 资源、愿望清单和家属指南
- 资源对接 · 家庭台账：家属轮流打电话问床位，谁打的、结果如何都记在数据库里，
  换设备打开、服务重启记录都在。已谈妥的排最前，暂时没床的沉底，有床了自动翻回前面。

## 台账接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/institutions` | 机构列表（含最近一次联系结果、联系次数、谈妥标记，已按台账规则排序） |
| POST | `/api/institutions/:id/contacts` | 登记一次联系：`{ "caller": "大姐", "result": "available", "note": "一句备注" }`，`result` 取 `available`（接通有床）/ `unavailable`（接通没床）/ `no_answer`（没人接） |
| GET | `/api/institutions/:id/contacts` | 该机构的全部联系记录，新的在前 |
| POST | `/api/institutions/:id/confirmed` | 标记/取消已谈妥：`{ "confirmed": true }` |

联系记录和谈妥标记保存在 PostgreSQL 的 `db_data` 数据卷中，容器重建、服务重启都不会丢。

## 本地开发

前端：

```bash
cd frontend
npm install
npm run dev
```

后端：

```bash
cd backend
npm install
npm run dev
```

数据库可通过根目录的 Docker Compose 单独启动：

```bash
docker compose up -d db
```

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React + Vite |
| 后端 | Node.js API（pg 连接数据库） |
| 数据库 | PostgreSQL |
| 部署 | Docker Compose + Nginx |

## 项目目录结构

```text
.
├── docker-compose.yml
├── .env.example
├── .env
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── ...
├── backend/
│   ├── Dockerfile
│   └── ...
└── database/
    └── ...
```

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| COMPOSE_PROJECT_NAME | Compose 项目名，避免中文目录名导致项目名为空 | gb-138 |
| DB_NAME | 数据库名称 | hospice_guide |
| DB_USER | 数据库用户 | app |
| DB_PASSWORD | 数据库密码 | app_pwd |
| DB_ROOT_PASSWORD | 数据库 root/superuser 密码 | root_pwd |
| JWT_SECRET | 后端签名密钥 | hospice_guide_secret_key_2026 |
| FRONTEND_PORT | 前端宿主机端口 | 8238 |
| BACKEND_PORT | 后端宿主机端口 | 3238 |
| DB_PORT | 数据库宿主机端口 | 5738 |

## Docker 部署说明

- `docker-compose.yml` 顶层已声明 `name: gb-138`，可以在中文目录名下直接运行。
- 数据库使用 Docker 命名卷 `db_data` 持久化，不绑定到宿主中文路径。
- 前端容器使用 Nginx 托管静态资源，并将 `/api` 反向代理到后端服务名 `backend`。
- 后端会等待数据库健康后再启动，前端会等待后端健康后再启动。
- 如本机端口冲突，修改根目录 `.env` 中的 `FRONTEND_PORT`、`BACKEND_PORT` 或 `DB_PORT`。

## License

MIT
