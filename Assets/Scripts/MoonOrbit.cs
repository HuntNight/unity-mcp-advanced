using UnityEngine;

public class MoonOrbit : MonoBehaviour
{
    public Transform planet;
    public float orbitSpeed = 30f;
    public float rotationSpeed = 20f;
    public float distance = 2f;
    
    private float angle;
    private Vector3 initialOffset;
    
    void Start()
    {
        if (planet != null)
        {
            initialOffset = transform.localPosition;
            distance = initialOffset.magnitude;
            angle = Mathf.Atan2(initialOffset.z, initialOffset.x) * Mathf.Rad2Deg;
        }
    }
    
    void Update()
    {
        if (planet != null)
        {
            angle += orbitSpeed * Time.deltaTime;
            float rad = angle * Mathf.Deg2Rad;
            transform.localPosition = new Vector3(Mathf.Cos(rad) * distance, initialOffset.y, Mathf.Sin(rad) * distance);
        }
        
        transform.Rotate(Vector3.up, rotationSpeed * Time.deltaTime, Space.Self);
    }
}
