"""Crea un usuario y una explotación de ejemplo para probar la app rápidamente.

    python -m scripts.seed_demo

Usuario: demo@ganaderia.ai / Demo1234!  (cámbialo o bórralo en producción)
"""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Animal, Farm, FarmUser, HerdGroup, Role, Sex, User

ANIMALS = [
    ("ES040812345678", "Lucera", "Avileña-Negra Ibérica", Sex.female, 2019, 540),
    ("ES040812340245", "Paloma", "Avileña-Negra Ibérica", Sex.female, 2020, 515),
    ("ES040812341101", "Morucha", "Morucha", Sex.female, 2018, 498),
    ("ES040812349002", "Toro Bravo", "Limusín", Sex.male, 2017, 980),
    ("ES040812343317", None, "Cruce", Sex.male, 2026, 42),
]


def main() -> None:
    db = SessionLocal()
    if db.scalar(select(User).where(User.email == "demo@ganaderia.ai")):
        print("La demo ya existe")
        return
    u = User(email="demo@ganaderia.ai", password_hash=hash_password("Demo1234!"), full_name="Usuario Demo")
    f = Farm(name="Finca Demo", province="Ávila", species_default="bovino")
    db.add_all([u, f])
    db.flush()
    db.add(FarmUser(farm_id=f.id, user_id=u.id, role=Role.owner))
    g1 = HerdGroup(farm_id=f.id, name="Nodrizas")
    g2 = HerdGroup(farm_id=f.id, name="Sementales")
    db.add_all([g1, g2])
    db.flush()
    for off, name, breed, sex, year, kg in ANIMALS:
        d = off[2:]
        db.add(
            Animal(
                farm_id=f.id,
                official_id=f"ES {d[:4]} {d[4:8]} {d[8:]}",
                official_id_normalized=off,
                name=name,
                breed=breed,
                sex=sex,
                birth_date=date(year, 3, 15) if year < 2026 else date.today() - timedelta(days=5),
                weight_kg=Decimal(kg),
                herd_group_id=(g2.id if sex == Sex.male and kg > 500 else g1.id),
            )
        )
    db.commit()
    print("Demo creada: demo@ganaderia.ai / Demo1234!")


if __name__ == "__main__":
    main()
